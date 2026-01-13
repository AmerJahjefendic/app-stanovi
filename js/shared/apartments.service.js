// js/shared/apartments.service.js
import { dbGetAll, dbGetOne, dbPutOne, dbDelete } from "../db/db.js";

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
 * Validacija: obavezna polja + MANAGED zahtijeva agencyPct (0-100)
 * Ne mijenja DB.
 */
export async function validateApartmentInput(input, { allowUpdate = false } = {}) {
    const id = _trim(input?.id);
    const name = _trim(input?.name) || id;
    const groupId = _trim(input?.groupId);
    const ownerType = _trim(input?.ownerType);
    const agencyPct = _normPct(input?.agencyPct);
    const address = _trim(input?.address);
    const ownerName = _trim(input?.ownerName);

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
        if (agencyPct === null) throw new Error("Za MANAGED apartman moraš unijeti agencyPct (npr 25).");
        if (!_isFiniteNumber(agencyPct)) throw new Error("agencyPct mora biti broj.");
        if (agencyPct < 0 || agencyPct > 100) throw new Error("agencyPct mora biti u opsegu 0–100.");
        if (!ownerName) throw new Error("Za MANAGED apartman moraš unijeti ime vlasnika.");
    } else {
        // OWNED
        if (agencyPct !== null) {
            // dozvoli, ali normalizuj na null (da ne pravimo konfuziju)
            // ne throwamo radi user iskustva
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
    };
}

/**
 * Kreira novi apartman. Ne dira postojeće podatke.
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
