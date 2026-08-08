// js/shared/apartments.service.js
import { dbGetAll, dbGetOne, dbPutOne, dbDelete, dbGetByIndex } from "../db/db.js";
import { cleanStr } from "./utils.js";

export const OWNER_TYPE = {
    OWNED: "OWNED",
    MANAGED: "MANAGED",
    // later: PARTNER, COMPANY
};

function _now() {
    return new Date().toISOString();
}

function _trim(s) {
    return String(s ?? "").trim();
}

function _isFiniteNumber(n) {
    return Number.isFinite(n);
}

function _normPct(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

export async function apartmentsListAll() {
    const rows = await dbGetAll("apartments");
    // Stabilan redoslijed: sort pa id
    return rows
        .slice()
        .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.id).localeCompare(String(b.id)));
}

export async function apartmentsListActive() {
    const rows = await apartmentsListAll();
    return rows.filter(r => r?.isActive !== false);
}

export async function apartmentsGet(id) {
    const key = _trim(id);
    if (!key) return null;
    return dbGetOne("apartments", key);
}

export async function groupsListAll() {
    const rows = await dbGetAll("groups");
    return rows.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export async function groupsExists(groupId) {
    const g = await dbGetOne("groups", _trim(groupId));
    return !!g;
}

/**
 * Validira input za kreiranje/ažuriranje apartmana.
 * Obavezna polja: id (osim update), name, groupId, ownerType.
 * MANAGED apartmani zahtijevaju agencyPct (0-100) i ownerName.
 * OWNED_SHARED grupe zahtijevaju shareKey.
 * 
 * @param {Object} input - Input objekat sa poljima apartmana
 * @param {Object} options - Opcije validacije
 * @param {boolean} options.allowUpdate - Ako je true, id nije obavezan (default: false)
 * @returns {Promise<Object>} Normalizovan i validiran objekat apartmana
 * @throws {Error} Ako validacija ne prođe
 */
export async function validateApartmentInput(input, { allowUpdate = false } = {}) {
    const id = _trim(input?.id);
    const name = _trim(input?.name) || id;
    const groupId = cleanStr(input?.groupId);
    const ownerType = _trim(input?.ownerType);
    const agencyPct = _normPct(input?.agencyPct);
    const address = _trim(input?.address);
    const ownerName = _trim(input?.ownerName);
    const shareKey = cleanStr(input?.shareKey);

    if (!allowUpdate) {
        if (!id) throw new Error("Apartment id je obavezan (npr. A, Z, N, B1...).");
        // vrlo strogo: bez razmaka
        if (/\s/.test(id)) throw new Error("Apartment id ne smije sadržavati razmake.");
    }

    if (!name) throw new Error("Naziv apartmana je obavezan.");
    if (!groupId) throw new Error("groupId je obavezan (npr. AZ ili N).");

    const groupOk = await groupsExists(groupId);
    if (!groupOk) throw new Error(`Nepostojeći groupId: "${groupId}". Prvo kreiraj grupu.`);

    if (!ownerType) throw new Error("ownerType je obavezan.");
    if (![OWNER_TYPE.OWNED, OWNER_TYPE.MANAGED].includes(ownerType)) {
        throw new Error(`ownerType mora biti "${OWNER_TYPE.OWNED}" ili "${OWNER_TYPE.MANAGED}".`);
    }

    if (ownerType === OWNER_TYPE.MANAGED) {
        if (agencyPct === null) throw new Error("Za MANAGED apartman moraš unijeti agencijsku proviziju (npr 25).");
        if (!_isFiniteNumber(agencyPct)) throw new Error("Agencijska provizija mora biti broj.");
        if (agencyPct < 0 || agencyPct > 100) throw new Error("Agencijska provizija mora biti u opsegu 0–100.");
        if (!ownerName) throw new Error("Za MANAGED apartman moraš unijeti ime vlasnika.");
    } else {
        // OWNED
        if (agencyPct !== null) {
            // dozvoli, ali normalizuj na null (da ne pravimo konfuziju)
            // ne throwamo radi user iskustva
        }
    }

    // shareKey validation for shared groups - check by group type
    const group = await dbGetOne("groups", groupId);
    const isOwnedShared = group?.type === "OWNED_SHARED";

    const shareKeyRaw = cleanStr(input?.shareKey);
    const shareKeyValidated = shareKeyRaw ? shareKeyRaw : null;

    if (isOwnedShared) {
        if (!shareKeyValidated) {
            throw new Error("Shared apartman mora imati odabran 'Shared set'.");
        }

        const ss = await dbGetOne("share_sets", shareKeyValidated);
        if (!ss) {
            throw new Error("Odabrani 'Shared set' ne postoji (možda je obrisan).");
        }
    }

    // sort
    const sortRaw = input?.sort;
    const sort = (sortRaw === "" || sortRaw === null || sortRaw === undefined) ? null : Number(sortRaw);
    if (sort !== null && !Number.isFinite(sort)) throw new Error("sort mora biti broj ili prazno.");

    return {
        id,
        name,
        groupId,
        ownerType,
        agencyPct: ownerType === OWNER_TYPE.MANAGED ? agencyPct : null,
        isActive: input?.isActive !== false,
        sort: sort ?? null,
        legacyCode: input?.legacyCode ? _trim(input.legacyCode) : id,
        address: address || "",
        ownerName: ownerType === OWNER_TYPE.MANAGED ? ownerName : "",
        shareKey: isOwnedShared ? shareKeyValidated : null,
    };
}

/**
 * Kreira novi apartman u bazi.
 * Validira input i vraća greške ako validacija ne prođe.
 * Postavlja createdAt i updatedAt timestampove.
 * 
 * @param {Object} input - Input objekat sa poljima apartmana
 * @returns {Promise<Object>} Kreirani apartman objekat
 * @throws {Error} Ako apartman sa datim ID-om već postoji ili validacija ne prođe
 */
export async function apartmentsCreate(input) {
    const clean = await validateApartmentInput(input, { allowUpdate: false });

    const exists = await apartmentsGet(clean.id);
    if (exists) throw new Error(`Apartman sa id="${clean.id}" već postoji.`);

    // default sort: max+10
    let sort = clean.sort;
    if (sort === null) {
        const all = await apartmentsListAll();
        const maxSort = all.reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0);
        sort = maxSort + 10;
    }

    const rec = {
        ...clean,
        sort,
        createdAt: _now(),
        updatedAt: _now(),
    };

    await dbPutOne("apartments", rec);
    return rec;
}

/**
 * Update postojećeg apartmana (npr promjena ownerType/agencyPct, name, groupId, isActive).
 */
export async function apartmentsUpdate(id, patch) {
    const key = _trim(id);
    if (!key) throw new Error("Nedostaje apartment id.");

    const cur = await apartmentsGet(key);
    if (!cur) throw new Error(`Apartman "${key}" ne postoji.`);

    const merged = { ...cur, ...patch, id: key };
    const clean = await validateApartmentInput(merged, { allowUpdate: true });

    const next = {
        ...cur,
        ...clean,
        updatedAt: _now(),
    };

    await dbPutOne("apartments", next);
    return next;
}

export async function apartmentsSetActive(id, isActive) {
    return apartmentsUpdate(id, { isActive: !!isActive });
}

export async function apartmentsDelete(id) {
    const key = _trim(id);
    if (!key) return true;

    // sigurnosno: ne dozvoli brisanje seed core A/Z/N bez posebne odluke
    if (["A", "Z", "N"].includes(key)) {
        throw new Error("Brisanje A/Z/N nije dozvoljeno (core apartmani). Možeš ih samo deaktivirati.");
    }

    await dbDelete("apartments", key);
    return true;
}

// ==================== SHARE SETS ====================

export async function shareSetsListAll() {
    const rows = await dbGetAll("share_sets");
    return rows
        .slice()
        .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)));
}


export async function apartmentsListByShareKey(shareKey, { activeOnly = true } = {}) {
    const key = _trim(shareKey);
    if (!key) return [];
    const rows = activeOnly ? await apartmentsListActive() : await apartmentsListAll();
    return rows.filter((row) => _trim(row?.shareKey) === key);
}

export async function shareSetsListActive() {
    const rows = await shareSetsListAll();
    return rows.filter((row) => row?.isActive !== false);
}

export async function shareSetsGet(id) {
    const key = _trim(id);
    if (!key) return null;
    return dbGetOne("share_sets", key);
}

export async function shareSetsCreate(input) {
    const now = _now();
    
    const id = _trim(input?.id);
    const name = _trim(input?.name);
    const address = _trim(input?.address) || "";
    const isActive = (input?.isActive === undefined) ? true : !!input.isActive;
    
    if (!id) throw new Error("Share set id je obavezan (npr. NIZE_BANJE_2).");
    if (!name) throw new Error("Naziv share seta je obavezan (npr. Niže banje 2).");
    
    // Duplikat check
    const exists = await shareSetsGet(id);
    if (exists) throw new Error(`Share set sa id="${id}" već postoji.`);
    
    // Sort validation and auto-calculation
    let sort = input?.sort;
    if (sort === "" || sort === undefined || sort === null) {
        // Auto-calculate: maxSort + 10
        const all = await dbGetAll("share_sets");
        const maxSort = all.reduce((m, s) => Math.max(m, Number(s.sort || 0)), 0);
        sort = maxSort + 10;
    } else {
        sort = Number(sort);
        if (!Number.isFinite(sort)) throw new Error("Sort mora biti broj.");
    }
    
    const rec = {
        id,
        name,
        address,
        isActive,
        sort,
        createdAt: now,
        updatedAt: now,
    };
    
    await dbPutOne("share_sets", rec);
    return rec;
}

export async function shareSetsUpdate(id, patch) {
    const now = _now();
    const sid = _trim(id);
    if (!sid) throw new Error("Share set id je obavezan.");

    const cur = await dbGetOne("share_sets", sid);
    if (!cur) throw new Error("Share set ne postoji.");

    const next = { ...cur };

    // Validate and update name if provided
    if ("name" in patch) {
        const name = _trim(patch.name);
        if (!name) throw new Error("Naziv share seta je obavezan (npr. Niže banje 2).");
        next.name = name;
    }

    // Validate and update address if provided
    if ("address" in patch) {
        next.address = _trim(patch.address) || "";
    }

    // Validate and update sort if provided
    if ("sort" in patch) {
        const v = patch.sort;
        if (v === "" || v === null || v === undefined) {
            // Keep current sort if empty
            next.sort = cur.sort ?? 0;
        } else {
            const n = Number(v);
            if (!Number.isFinite(n)) throw new Error("Sort mora biti broj.");
            next.sort = n;
        }
    }

    // Update isActive if provided
    if ("isActive" in patch) {
        next.isActive = !!patch.isActive;
    }

    // Legacy safety: ensure createdAt exists
    if (!next.createdAt) {
        next.createdAt = cur.updatedAt || now;
    }

    next.updatedAt = now;
    
    await dbPutOne("share_sets", next);
    return next;
}

export async function shareSetsDelete(id) {
    const key = _trim(id);
    if (!key) return true;
    
    // Referential integrity check: ne brisati share set koji se koristi
    const used = await dbGetByIndex("apartments", "shareKey", key);
    if (used.length > 0) {
        const names = used.map(a => a.name || a.id).join(", ");
        throw new Error(`Nije moguće obrisati 'Shared set' jer ga koriste apartmani: ${names}`);
    }
    
    await dbDelete("share_sets", key);
    return true;
}
