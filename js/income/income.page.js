// js/income/income.page.js
import { dbDelete, dbGetAll, dbGetOne, dbGetOneByIndex, dbPutOne, makeId } from "../db/db.js";
import { keyFromPeriod, periodKeyToYM, safeDate } from "../shared/utils.js";
import { debug } from "../shared/log.js";
import { FeeModels, Platforms } from "../shared/constants.js";
import { calculateManagedReservation } from "../shared/managed-income-calculator.js";
import { renderYearCalendar, withLoading } from "../shared/ui.js";
import { periodLabel } from "../shared/parseFilename.js";
import { renderIncomeSummary, renderIncomeItemsTable, renderIncomeByApt } from "./income.ui.js";

console.log("[income.page.js] loaded", new Date().toISOString());
window.__incomeLoaded = true;

const els = {
    incPlatform: document.getElementById("incPlatform"),

    modal: document.getElementById("incomeModal"),
    btnOpenModal: document.getElementById("btnOpenIncomeModal"),

    incAddApt: document.getElementById("incAddApt"),
    incAddAmount: document.getElementById("incAddAmount"),
    incAddPlatform: document.getElementById("incAddPlatform"),
    incAddPaid: document.getElementById("incAddPaid"),
    incAddCheckin: document.getElementById("incAddCheckin"),
    incAddCheckout: document.getElementById("incAddCheckout"),
    incAddNights: document.getElementById("incAddNights"),
    incAddNote: document.getElementById("incAddNote"),
    btnAddIncomeItem: document.getElementById("btnAddIncomeItem"),

    vrboFxWrap: document.getElementById("vrboFxWrap"),
    incAddAmountUsd: document.getElementById("incAddAmountUsd"),
    incAddFxRate: document.getElementById("incAddFxRate"),
    btnFetchFx: document.getElementById("btnFetchFx"),
    fxMsg: document.getElementById("fxMsg"),

    bookingFeeWrap: document.getElementById("bookingFeeWrap"),
    incAddBookingFee: document.getElementById("incAddBookingFee"),

    eurWrap: document.getElementById("eurWrap"),
    datesWrap: document.getElementById("datesWrap"),
    nightsWrap: document.getElementById("nightsWrap"),

    calendar: document.getElementById("incCalendar"),
    status: document.getElementById("incStatus"),
    incApt: document.getElementById("incApt"),
    summary: document.getElementById("incSummary"),
    itemsTable: document.getElementById("incItemsTable"),
    byApt: document.getElementById("incByApt"),
    btnToggleItems: document.getElementById("btnToggleIncItems"),
    itemsWrap: document.getElementById("incItemsWrap"),
};

const state = {
    apt: "ALL",
    platform: "ALL",
    selectedCalendarYear: null,
    selectedPeriodKey: null,
    isYearView: false,
    editingIncomeItemId: null,
};

const CF_EUR = 10;
const COMM = 0.25;

// ---------- helpers ----------

function round2(x) {
    return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

async function fetchUsdEurRateForToday() {
    const dateISO = todayISO();
    const url = `https://api.frankfurter.app/${dateISO}?from=USD&to=EUR`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("FX fetch failed");
    const data = await res.json();
    const rate = Number(data?.rates?.EUR);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Bad FX data");
    return rate;
}

function setFxMsg(msg) {
    if (!els.fxMsg) return;
    els.fxMsg.textContent = msg || "";
}

function nightsFromDates(checkin, checkout) {
    if (!checkin || !checkout) return 0;
    const a = safeDate(checkin);
    const b = safeDate(checkout);
    if (!a || !b) return 0;
    const ms = b.getTime() - a.getTime();
    const n = Math.round(ms / (1000 * 60 * 60 * 24));
    return n > 0 ? n : 0;
}

function periodFromInputsOrSelected(checkinStr) {
    if (checkinStr) {
        const d = safeDate(checkinStr);
        if (d) return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }
    if (state.selectedPeriodKey) return periodKeyToYM(state.selectedPeriodKey);

    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

// ---------- modal field toggles ----------

function toggleFieldsByPlatform() {
    const platform = (els.incAddPlatform?.value || "").toLowerCase();

    const isVrbo = platform === "vrbo";
    const isBooking = platform === "booking";

    els.vrboFxWrap?.classList.toggle("is-hidden", !isVrbo);
    els.bookingFeeWrap?.classList.toggle("is-hidden", !isBooking);

    // booking fee required
    if (els.incAddBookingFee) {
        els.incAddBookingFee.required = isBooking;
        if (!isBooking) els.incAddBookingFee.value = "";
    }

    // EUR input hidden for VRBO
    els.eurWrap?.classList.toggle("is-hidden", isVrbo);

    // Paid default rule
    if (els.incAddPaid) els.incAddPaid.checked = (platform === "airbnb");

    // focus
    queueMicrotask(() => {
        if (isVrbo) els.incAddAmountUsd?.focus();
        else els.incAddAmount?.focus();
    });

    // clear vrbo fx when leaving vrbo
    if (!isVrbo) {
        if (els.incAddAmountUsd) els.incAddAmountUsd.value = "";
        if (els.incAddFxRate) els.incAddFxRate.value = "";
        setFxMsg("");
    }
}

function toggleFieldsByApartment() {
    const apt = els.incAddApt?.value || "A";
    const isN = apt === "N";

    // N: datumi obavezni, nights sakrij i disable
    els.datesWrap?.classList.toggle("is-hidden", false);
    els.nightsWrap?.classList.toggle("is-hidden", isN);

    if (els.incAddCheckin) {
        els.incAddCheckin.required = isN;
        els.incAddCheckin.disabled = false;
    }
    if (els.incAddCheckout) {
        els.incAddCheckout.required = isN;
        els.incAddCheckout.disabled = false;
    }

    if (els.incAddNights) {
        els.incAddNights.disabled = isN;
        if (isN) els.incAddNights.value = "";
    }
}

function resetIncomeForm({ keepApt = true, keepPlatform = true } = {}) {
    state.editingIncomeItemId = null;
    if (els.btnAddIncomeItem) {
        els.btnAddIncomeItem.textContent = "Dodaj prihod";
    }
    if (els.incAddAmount) els.incAddAmount.value = "";
    if (els.incAddAmountUsd) els.incAddAmountUsd.value = "";
    if (els.incAddFxRate) els.incAddFxRate.value = "";
    if (els.incAddBookingFee) els.incAddBookingFee.value = "";
    if (els.incAddCheckin) els.incAddCheckin.value = "";
    if (els.incAddCheckout) els.incAddCheckout.value = "";
    if (els.incAddNights) els.incAddNights.value = "";
    if (els.incAddNote) els.incAddNote.value = "";

    if (!keepPlatform && els.incAddPlatform) els.incAddPlatform.value = "airbnb";
    if (!keepApt && els.incAddApt) els.incAddApt.value = "A";

    toggleFieldsByPlatform();
    toggleFieldsByApartment();
    if (els.incAddPaid) els.incAddPaid.checked = (els.incAddPlatform?.value === "airbnb");
}

function openModal() {
    els.modal?.classList.remove("is-hidden");
    els.modal?.setAttribute("aria-hidden", "false");
    toggleFieldsByPlatform();
    toggleFieldsByApartment();

    // focus first input
    setTimeout(() => {
        const isVrbo = (els.incAddPlatform?.value || "") === "vrbo";
        (isVrbo ? els.incAddAmountUsd : els.incAddAmount)?.focus();
    }, 0);
}

function closeModal() {
    state.editingIncomeItemId = null;
    if (els.btnAddIncomeItem) {
        els.btnAddIncomeItem.textContent = "Dodaj prihod";
    }
    els.modal?.classList.add("is-hidden");
    els.modal?.setAttribute("aria-hidden", "true");
}

// ---------- DB helpers ----------

async function ensureImportPeriod(year, month) {
    const existing = await dbGetOneByIndex("imports", "by_period", [year, month]);
    if (existing) return;
    await dbPutOne("imports", {
        id: `manual_${year}_${String(month).padStart(2, "0")}`,
        year,
        month,
        source: "MANUAL",
        created_at: new Date().toISOString(),
    });
}

// ---------- N breakdown + upsert ----------
// booking_fee_eur u n_commission = platformFee (Booking fee ili Airbnb fee), VRBO=0
function calcNBreakdown({
    platform,
    grossAmount = 0,       // unos rezervacije (bez CF) za Airbnb/Booking
    splitBase = 0,         // osnovica koja se dijeli 75/25
    platformFee = 0        // booking fee ili airbnb fee
}) {
    const gross = Number(grossAmount || 0);
    const split = Number(splitBase || 0);
    const fee = Number(platformFee || 0);

    const ownerAmount = round2(split * 0.75);
    const commissionAmount = round2(split * 0.25 + CF_EUR);

    return {
        platform,
        gross_eur: round2(gross),          // unos (bez CF)
        net_eur: round2(split),            // ✅ splitBase (bez CF)
        booking_fee_eur: round2(fee),      // ✅ platform fee (Booking ili Airbnb)
        owner_eur: ownerAmount,
        commission_eur: commissionAmount,
    };
}

async function upsertNCommission(year, month, details) {
    const existing = await dbGetOneByIndex("n_commission", "by_period", [year, month]);

    const prevSplit = Number(existing?.incomeN_eur_total || 0);
    const prevOwner = Number(existing?.owner_eur || 0) || 0;
    const prevComm = Number(existing?.commission_eur || 0) || 0;
    const prevFee = Number(existing?.booking_fee_eur || 0) || 0;

    const splitDelta = Number(details?.net_eur || 0);
    const ownerDelta = Number(details?.owner_eur || 0) || 0;
    const commDelta = Number(details?.commission_eur || 0) || 0;
    const feeDelta = Number(details?.booking_fee_eur || 0) || 0;

    await dbPutOne("n_commission", {
        id: existing?.id || `ncomm_${year}_${String(month).padStart(2, "0")}`,
        year,
        month,

        // ovo je splitBase koji ostaje "nama" za raspodjelu
        incomeN_eur_total: round2(prevSplit + splitDelta),

        // platform fee (booking fee ili airbnb fee)
        booking_fee_eur: round2(prevFee + feeDelta),

        owner_eur: round2(prevOwner + ownerDelta),
        commission_eur: round2(prevComm + commDelta),

        platform: details?.platform || existing?.platform || null,
        updated_at: new Date().toISOString(),
    });
}

function computeSplitBaseForNItem(item) {
    return Number(item.amount_eur || 0) || 0;
}

async function rebuildNCommissionForPeriod(year, month) {
    const items = await dbGetAll("income_items");
    const nItems = items.filter(it =>
        it.apartment === "N" &&
        Number(it.year) === Number(year) &&
        Number(it.month) === Number(month)
    );

    let incomeNTotal = 0;
    let bookingFeeTotal = 0;
    let ownerTotal = 0;
    let commissionTotal = 0;
    let lastPlatform = null;

    for (const it of nItems) {
        const platform = String(it.platform || "").toLowerCase();
        const splitBase = computeSplitBaseForNItem(it);

        if (!Number.isFinite(splitBase) || splitBase <= 0) continue;

        const fee = Number(it.platform_fee_eur || 0) || 0;
        const owner = round2(splitBase * 0.75);
        const commission = round2(splitBase * 0.25 + CF_EUR);

        incomeNTotal += splitBase;
        bookingFeeTotal += fee;
        ownerTotal += owner;
        commissionTotal += commission;
        lastPlatform = platform || lastPlatform;
    }

    const existing = await dbGetOneByIndex("n_commission", "by_period", [year, month]);

    await dbPutOne("n_commission", {
        id: existing?.id || `ncomm_${year}_${String(month).padStart(2, "0")}`,
        year,
        month,
        incomeN_eur_total: round2(incomeNTotal),
        booking_fee_eur: round2(bookingFeeTotal),
        owner_eur: round2(ownerTotal),
        commission_eur: round2(commissionTotal),
        platform: lastPlatform,
        updated_at: new Date().toISOString(),
    });
}

// ---------- ADD ITEM (core logic) ----------

async function openIncomeItemForEdit(id) {
    const items = await dbGetAll("income_items");
    const item = items.find(x => String(x.id) === String(id));
    if (!item) {
        alert("Unos prihoda nije pronađen.");
        return;
    }
    state.editingIncomeItemId = item.id;
    if (els.incAddApt) els.incAddApt.value = item.apartment || "";
    if (els.incAddPlatform) {
        els.incAddPlatform.value = item.platform || "Booking";
        els.incAddPlatform.dispatchEvent(new Event("change"));
    }
    const platform = String(item.platform || "").toLowerCase();
    if (els.incAddAmount) {
        if (platform === "booking") {
            els.incAddAmount.value = item.gross_eur ?? item.amount_eur ?? "";
        } else if (platform === "airbnb" && item.apartment === "N") {
            els.incAddAmount.value = item.gross_eur ?? item.amount_eur ?? "";
        } else {
            els.incAddAmount.value = item.amount_eur ?? "";
        }
    }
    if (els.incAddAmountUsd) {
        els.incAddAmountUsd.value = item.amount_usd ?? "";
    }
    if (els.incAddFxRate) {
        els.incAddFxRate.value = item.fx_usd_eur ?? item.fx_rate ?? "";
    }
    if (els.incAddBookingFee) {
        els.incAddBookingFee.value = item.platform_fee_eur ?? "";
    }
    if (els.incAddCheckin) els.incAddCheckin.value = item.checkin || "";
    if (els.incAddCheckout) els.incAddCheckout.value = item.checkout || "";
    if (els.incAddNote) els.incAddNote.value = item.note || "";
    if (els.btnAddIncomeItem) {
        els.btnAddIncomeItem.textContent = "Sačuvaj izmjenu";
    }
    toggleFieldsByApartment();
    if (els.incAddPaid) {
        els.incAddPaid.checked = !!item.paid;
    }
    if (els.modal) {
        els.modal.classList.remove("is-hidden");
        els.modal.setAttribute("aria-hidden", "false");
    }
}

async function deleteIncomeItem(id) {
    const item = await dbGetOne("income_items", id);
    if (!item) {
        alert("Unos prihoda nije pronađen.");
        return;
    }

    const periodLabel =
        item.checkin && item.checkout
            ? `${item.checkin} – ${item.checkout}`
            : `${item.year}-${String(item.month).padStart(2, "0")}`;

    const confirmed = confirm(
        `Obrisati prihod?\n\n` +
        `Apartman: ${item.apartment || "—"}\n` +
        `Period: ${periodLabel}\n` +
        `Iznos: ${Number(item.amount_eur || 0).toFixed(2)} €`
    );
    if (!confirmed) return;

    try {
        await dbDelete("income_items", item.id);
        if (item.apartment === "N") {
            await rebuildNCommissionForPeriod(item.year, item.month);
        }
        await render();
    } catch (e) {
        console.error(e);
        alert(e?.message || "Greška pri brisanju prihoda.");
    }
}

async function handleAddIncomeItem() {
    debug("CLICK add income item");

    let existingItem = null;
    if (state.editingIncomeItemId) {
        const items = await dbGetAll("income_items");
        existingItem = items.find(x => String(x.id) === String(state.editingIncomeItemId));
        if (!existingItem) {
            alert("Unos prihoda nije pronađen.");
            return;
        }
    }

    const apartment = els.incAddApt?.value || "A";
    const platform = (els.incAddPlatform?.value || "").toLowerCase();
    const isN = apartment === "N";

    let amountToStore = 0;         // income_items.amount_eur (A/Z prihod; za N čuvamo splitBase)
    let grossAmount = 0;          // relevantno: Booking (gross) i N+Airbnb (gross reservation)
    let platformFee = 0;          // relevantno: Booking fee (svima), Airbnb fee (samo N)
    let splitBase = 0;            // relevantno za N: osnovica koja se dijeli 75/25

    // --- VRBO ---
    if (platform === "vrbo") {
        const usd = Number(els.incAddAmountUsd?.value || 0);
        const rate = Number(els.incAddFxRate?.value || 0);

        if (!Number.isFinite(usd) || usd <= 0) return alert("Unesi ispravan VRBO iznos (USD).");
        if (!Number.isFinite(rate) || rate <= 0) return alert("Unesi kurs USD→EUR (ili klikni ↻ Kurs).");

        const grossEur = usd * rate;           // ✅ konvertovani payout = GROSS u EUR
        platformFee = 0;                       // ✅ VRBO fee (u tvom modelu) 0

        if (isN) {
            let calculation;
            try {
                calculation = calculateManagedReservation({
                    platform: Platforms.VRBO,
                    amountUsd: usd,
                    fxUsdEur: rate,
                    // TODO Phase 2:
                    // koristiti cleaning fee iz commission_rules
                    cleaningFee: CF_EUR,
                });
            } catch (error) {
                return alert(error?.message || "NET za N mora biti > 0 (provjeri iznos/kurs).");
            }

            amountToStore = calculation.splitBase;
            splitBase = calculation.splitBase;
            grossAmount = calculation.grossAmount;
            platformFee = calculation.platformFee;
        } else {
            // A/Z: VRBO tretiraj kao normalan prihod (nema CF logike)
            amountToStore = grossEur;
            grossAmount = grossEur;     // opcionalno, ali korisno da gross_eur nije null
        }
    }

    // --- BOOKING (svima: NET = gross - fee) ---
    else if (platform === "booking") {
        const gross = Number(els.incAddAmount?.value || 0);          // gross rezervacije
        const fee = Number(els.incAddBookingFee?.value || 0);        // booking fee

        if (!Number.isFinite(gross) || gross <= 0) return alert("Unesi ispravan iznos rezervacije (EUR).");
        if (!Number.isFinite(fee) || fee < 0) return alert("Unesi Booking fee (EUR).");

        // A/Z: NET prihod = gross - fee
        // N: NET nama (za raspodjelu) = gross - fee - CF
        const netForApt = gross - fee;
        if (!(Number.isFinite(netForApt) && netForApt > 0)) return alert("NET mora biti > 0 (provjeri fee).");

        grossAmount = gross;
        platformFee = fee;

        if (isN) {
            let calculation;
            try {
                calculation = calculateManagedReservation({
                    platform: Platforms.BOOKING,
                    grossAmount: gross,
                    platformFee: fee,
                    // TODO Phase 2:
                    // koristiti cleaning fee iz commission_rules
                    cleaningFee: CF_EUR,
                });
            } catch (error) {
                return alert(error?.message || "NET za N mora biti > 0 (provjeri fee).");
            }

            amountToStore = calculation.splitBase;
            splitBase = calculation.splitBase;
            grossAmount = calculation.grossAmount;
            platformFee = calculation.platformFee;
        } else {
            amountToStore = netForApt; // ✅ A/Z
        }
    }

    // --- AIRBNB / DIRECT / OTHER ---
    else {
        const eur = Number(els.incAddAmount?.value || 0);
        if (!Number.isFinite(eur) || eur <= 0) return alert("Unesi ispravan iznos (EUR).");

        // ✅ N + Airbnb: unos = reservation price (bez CF)
        if (platform === Platforms.AIRBNB && isN) {
            let calculation;
            try {
                calculation = calculateManagedReservation({
                    platform: Platforms.AIRBNB,
                    feeModel: FeeModels.SPLIT_FEE,
                    grossAmount: eur,
                    // TODO Phase 2:
                    // koristiti cleaning fee iz commission_rules
                    cleaningFee: CF_EUR,
                });
            } catch (error) {
                return alert(error?.message || "NET mora biti > 0 (provjeri unos).");
            }

            amountToStore = calculation.splitBase;
            splitBase = calculation.splitBase;
            grossAmount = calculation.grossAmount;
            platformFee = calculation.platformFee;
        }

        else {
            // ✅ A/Z Airbnb/direct/other: unos = kompletan prihod
            amountToStore = eur;

            // Direct/Other nema platform fee.
            // CF se prvo izdvaja, ostatak ide u raspodjelu.
            if (isN) {
                splitBase = eur - CF_EUR; // prvo oduzmi CF, pa raspodjeli
                platformFee = 0;
                grossAmount = 0;
            }
        }
    }

    // --- dates/nights validation ---
    const checkin = els.incAddCheckin?.value || "";
    const checkout = els.incAddCheckout?.value || "";
    const note = (els.incAddNote?.value || "").trim();
    const period = periodFromInputsOrSelected(checkin);
    let nights = 0;

    if (isN) {
        if (!checkin || !checkout) return alert("Za apartman N moraš unijeti i Check-in i Check-out (obavezno radi izvještaja).");
        const a = safeDate(checkin);
        const b = safeDate(checkout);
        if (!a || !b || b.getTime() <= a.getTime()) return alert("Check-out mora biti poslije check-in datuma.");
        nights = nightsFromDates(checkin, checkout);
    } else {
        const hasBothDates = !!checkin && !!checkout;
        const nightsInputRaw = els.incAddNights?.value;
        const hasManualNights = (nightsInputRaw !== "" && nightsInputRaw != null);
        if (hasBothDates) {
            const a = safeDate(checkin);
            const b = safeDate(checkout);
            if (!a || !b || b.getTime() <= a.getTime()) {
                return alert("Check-out mora biti poslije check-in datuma.");
            }
            nights = nightsFromDates(checkin, checkout);
        } else if (hasManualNights) {
            const nn = Number(nightsInputRaw);
            nights = Number.isFinite(nn) ? Math.max(0, Math.round(nn)) : 0;
        } else {
            return alert("Za apartmane A/Z unesi ili Noćenja ili oba datuma (Check-in i Check-out).");
        }
    }

    // --- persist item ---
    const item = {
        id: existingItem?.id || makeId("incit"),
        year: period.year,
        month: period.month,
        apartment,
        platform,
        feeModel:
            platform === Platforms.AIRBNB && isN
                ? FeeModels.SPLIT_FEE
                : null,

        // Vrijednost koja se knjiži u income_items; za N čuvamo splitBase
        amount_eur: round2(amountToStore),

        // Future/debug fields (ne traže DB migraciju)
        gross_eur: Number.isFinite(grossAmount) ? round2(grossAmount) : null,
        platform_fee_eur: Number.isFinite(platformFee) ? round2(platformFee) : null,

        // VRBO FX info
        currency: platform === "vrbo" ? "USD" : "EUR",
        amount_usd: platform === "vrbo" ? round2(Number(els.incAddAmountUsd?.value || 0)) : null,
        fx_usd_eur: platform === "vrbo" ? Number(els.incAddFxRate?.value || 0) : null,
        fx_date: platform === "vrbo" ? todayISO() : null,

        paid: !!els.incAddPaid?.checked,
        nights,
        checkin: checkin || null,
        checkout: checkout || null,
        note,
        source: "Manual",
        created_at: existingItem?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    try {
        await dbPutOne("income_items", item);
        await ensureImportPeriod(period.year, period.month);
        if (
            existingItem &&
            (
                Number(existingItem.year) !== Number(period.year) ||
                Number(existingItem.month) !== Number(period.month)
            )
        ) {
            await ensureImportPeriod(existingItem.year, existingItem.month);
        }

        // --- N: commission sync ---
        if (existingItem) {
            const affectedPeriods = new Set();
            if (existingItem.apartment === "N") {
                affectedPeriods.add(`${existingItem.year}-${existingItem.month}`);
            }
            if (isN) {
                affectedPeriods.add(`${period.year}-${period.month}`);
            }
            for (const key of affectedPeriods) {
                const [y, m] = key.split("-").map(Number);
                await rebuildNCommissionForPeriod(y, m);
            }
        } else if (isN) {
            const details = calcNBreakdown({
                platform,
                grossAmount,
                splitBase,
                platformFee,
            });
            await upsertNCommission(period.year, period.month, details);
        }

        resetIncomeForm();
        closeModal();
        await render();
    } catch (e) {
        console.error(e);
        alert(e?.message || "Greška pri snimanju prihoda.");
    }
}

// ---------- load/render ----------

async function load() {
    const [incomeMonthly, incomeItems, nCommission, imports] = await Promise.all([
        dbGetAll("income_monthly"),
        dbGetAll("income_items").catch(() => []),
        dbGetAll("n_commission"),
        dbGetAll("imports"),
    ]);
    return { incomeMonthly, incomeItems, nCommission, imports };
}

function applyFilters(data, aptFilter, platformFilter) {
    const { incomeMonthly, incomeItems } = data;

    let filteredMonthly = incomeMonthly;
    let filteredItems = incomeItems;

    // PERIOD FILTER (isto kao sada)
    if (state.selectedPeriodKey) {
        const { year, month } = periodKeyToYM(state.selectedPeriodKey);
        filteredMonthly = filteredMonthly.filter(r => r.year === year && r.month === month);
        filteredItems = filteredItems.filter(r => r.year === year && r.month === month);
    } else if (state.isYearView && state.selectedCalendarYear) {
        filteredMonthly = filteredMonthly.filter(r => r.year === state.selectedCalendarYear);
        filteredItems = filteredItems.filter(r => r.year === state.selectedCalendarYear);
    }

    // APT FILTER
    if (aptFilter !== "ALL") {
        filteredMonthly = filteredMonthly.filter(r => r.apartment === aptFilter);
        filteredItems = filteredItems.filter(r => r.apartment === aptFilter);
    }

    // PLATFORM FILTER (samo na income_items jer monthly nema platformu)
    if (platformFilter && platformFilter !== "ALL") {
        filteredItems = filteredItems.filter(r => String(r.platform || "").toLowerCase() === platformFilter);
    }

    return { filteredMonthly, filteredItems };
}

function computeSums(filteredMonthly, filteredItems, nCommission) {
    const sumsAZN = {
        A: { income: 0, nights: 0 },
        Z: { income: 0, nights: 0 },
        N: { income: 0, nights: 0 },
    };

    const useItems = Array.isArray(filteredItems) && filteredItems.length > 0;

    if (useItems) {
        for (const it of filteredItems || []) {
            if (!sumsAZN[it.apartment]) continue;

            // A/Z prihod iz items.amount_eur
            if (it.apartment === "A" || it.apartment === "Z") {
                sumsAZN[it.apartment].income += Number(it.amount_eur || 0) || 0;
            }

            // nights
            let n = 0;
            if (it.nights != null && it.nights !== "") {
                const nn = Number(it.nights);
                n = Number.isFinite(nn) ? nn : 0;
            } else {
                n = nightsFromDates(it.checkin, it.checkout);
            }
            sumsAZN[it.apartment].nights += n;
        }
    } else {
        for (const r of filteredMonthly || []) {
            if (!sumsAZN[r.apartment]) continue;
            sumsAZN[r.apartment].income += Number(r.income_eur || 0) || 0;
            sumsAZN[r.apartment].nights += Number(r.nights || 0) || 0;
        }
    }

    // N breakdown from n_commission
    const nBreakdown = { income_total: 0, my_commission: 0, owner: 0 };

    const periodKeys = new Set();
    if (useItems) {
        for (const it of filteredItems || []) {
            if (it.apartment === "N") periodKeys.add(`${it.year}-${String(it.month).padStart(2, "0")}`);
        }
    } else {
        for (const r of filteredMonthly || []) {
            if (r.apartment === "N") periodKeys.add(`${r.year}-${String(r.month).padStart(2, "0")}`);
        }
    }

    for (const key of periodKeys) {
        const [year, month] = key.split("-").map(Number);
        const comm = (nCommission || []).find(c => c.year === year && c.month === month);
        if (!comm) continue;

        const incomeNet = Number(comm.incomeN_eur_total || 0) || 0;
        const commission = round2(Number(comm.commission_eur ?? 0) || 0);
        const owner = round2(Number(comm.owner_eur ?? 0) || 0);

        nBreakdown.income_total += incomeNet;
        nBreakdown.my_commission += commission;
        nBreakdown.owner += owner;
    }

    // N u “by apt” = moja provizija
    sumsAZN.N.income = nBreakdown.my_commission;

    // TOTAL: A + Z + ukupan N net (koji ostaje nama)
    const total = {
        income: sumsAZN.A.income + sumsAZN.Z.income + nBreakdown.income_total,
        nights: sumsAZN.A.nights + sumsAZN.Z.nights + sumsAZN.N.nights,
    };

    return { sumsAZN, nBreakdown, total };
}

async function setIncomeItemPaid(id, paid) {
    if (!id) return;

    const row = await dbGetOne("income_items", id);
    if (!row) {
        alert("Ne mogu naći stavku u bazi (income_items).");
        return;
    }

    row.paid = !!paid;
    row.updated_at = new Date().toISOString();

    await dbPutOne("income_items", row);
}

async function render() {
    const data = await load();

    data.imports.sort((a, b) => a.year - b.year || a.month - b.month);

    if (!state.selectedCalendarYear) {
        state.selectedCalendarYear = data.imports.length
            ? data.imports[data.imports.length - 1].year
            : new Date().getFullYear();
    }

    if (!state.selectedPeriodKey && !state.isYearView && data.imports.length) {
        const last = data.imports[data.imports.length - 1];
        state.selectedPeriodKey = keyFromPeriod(last.year, last.month);
    }

    const monthsSet = new Set(
        data.imports.filter(i => i.year === state.selectedCalendarYear).map(i => i.month)
    );

    renderYearCalendar(els.calendar, {
        year: state.selectedCalendarYear,
        importedMonthsSet: monthsSet,
        selectedKey: state.selectedPeriodKey,
        isYearView: state.isYearView,
    });

    const { filteredMonthly, filteredItems } = applyFilters(data, state.apt, state.platform);
    const { sumsAZN, nBreakdown, total } = computeSums(filteredMonthly, filteredItems, data.nCommission);

    const useItems = filteredItems.length > 0;
    const itemCount = useItems ? filteredItems.length : filteredMonthly.length;

    if (state.selectedPeriodKey) {
        const { year, month } = periodKeyToYM(state.selectedPeriodKey);
        els.status.textContent = `Period: ${periodLabel({ year, month })} — Stavki: ${itemCount}`;
        const pf = state.platform && state.platform !== "ALL" ? ` • Platforma: ${state.platform}` : "";
        els.status.textContent += pf;

    } else {
        const y = state.selectedCalendarYear || new Date().getFullYear();
        els.status.textContent = `Godina: ${y} — Stavki: ${itemCount}`;
    }

    renderIncomeSummary(els.summary, { sumsAZN, nBreakdown, total });

    const itemsForTable = filteredItems.length
        ? filteredItems
        : filteredMonthly.map(r => ({
            ...r,
            amount_eur: r.income_eur,
            note: `Sumarni prihod (${r.source || "nepoznato"})`,
        }));

    renderIncomeItemsTable(els.itemsTable, itemsForTable);
    renderIncomeByApt(els.byApt, sumsAZN);
}

// ---------- attach ----------

function attach() {
    els.incPlatform?.addEventListener("change", async () => {
        state.platform = els.incPlatform.value;
        await withLoading(async () => { await render(); });
    });

    if (!els.datesWrap) console.warn("Missing #datesWrap in HTML");
    if (!els.nightsWrap) console.warn("Missing #nightsWrap in HTML");

    els.btnToggleItems?.addEventListener("click", () => {
        const isHidden = els.itemsWrap.classList.toggle("is-collapsed");
        els.btnToggleItems.textContent = isHidden ? "Prikaži" : "Sakrij";
    });

    els.itemsTable?.addEventListener("change", async (e) => {
        const cb = e.target.closest(".paidToggle");
        if (!cb) return;

        const id = cb.dataset.id;
        const paid = cb.checked;

        try {
            // učitaj postojeći item
            const item = await dbGetOne("income_items", id);
            if (!item) return;

            item.paid = paid;
            item.updated_at = new Date().toISOString();

            await dbPutOne("income_items", item);
            await render();
        } catch (err) {
            console.error(err);
            alert("Greška pri izmjeni 'plaćeno'.");
        }
    });

    els.itemsTable?.addEventListener("click", async (e) => {
        const editBtn = e.target.closest('[data-action="edit-income-item"]');
        if (editBtn) {
            await openIncomeItemForEdit(editBtn.dataset.id);
            return;
        }

        const deleteBtn = e.target.closest('[data-action="delete-income-item"]');
        if (deleteBtn) {
            await deleteIncomeItem(deleteBtn.dataset.id);
        }
    });

    els.incApt?.addEventListener("change", async () => {
        state.apt = els.incApt.value;
        await withLoading(async () => { await render(); });
    });

    els.incAddApt?.addEventListener("change", toggleFieldsByApartment);

    els.calendar?.addEventListener("click", async (e) => {
        const yearClick = e.target.closest("[data-cal='year']");
        if (yearClick) {
            state.isYearView = !state.isYearView;

            if (state.isYearView) {
                state.selectedPeriodKey = null;
            } else {
                const { imports } = await load();
                const inYear = imports.filter(i => i.year === state.selectedCalendarYear).sort((a, b) => a.month - b.month);
                state.selectedPeriodKey = inYear.length ? keyFromPeriod(inYear[inYear.length - 1].year, inYear[inYear.length - 1].month) : null;
            }

            await withLoading(async () => { await render(); });
            return;
        }

        const prev = e.target.closest("[data-cal='prev']");
        const next = e.target.closest("[data-cal='next']");
        if (prev || next) {
            state.selectedCalendarYear += prev ? -1 : 1;

            const { imports } = await load();
            const inYear = imports.filter(i => i.year === state.selectedCalendarYear).sort((a, b) => a.month - b.month);

            if (state.isYearView) {
                state.selectedPeriodKey = null;
            } else {
                state.selectedPeriodKey = inYear.length ? keyFromPeriod(inYear[inYear.length - 1].year, inYear[inYear.length - 1].month) : null;
            }

            await withLoading(async () => { await render(); });
            return;
        }

        const cell = e.target.closest(".monthCell");
        if (!cell) return;
        if (cell.classList.contains("is-disabled")) return;

        const m = Number(cell.dataset.month);
        state.isYearView = false;
        state.selectedPeriodKey = keyFromPeriod(state.selectedCalendarYear, m);
        await withLoading(async () => { await render(); });
    });

    els.btnOpenModal?.addEventListener("click", openModal);

    els.modal?.addEventListener("click", (e) => {
        if (e.target.closest("[data-modal-close]")) closeModal();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && els.modal && !els.modal.classList.contains("is-hidden")) closeModal();
    });

    els.btnAddIncomeItem?.addEventListener("click", handleAddIncomeItem);

    els.incAddPlatform?.addEventListener("change", async () => {
        toggleFieldsByPlatform();

        if (els.incAddPlatform.value === "vrbo") {
            if (state.editingIncomeItemId) return;
            try {
                setFxMsg("Učitavam kurs…");
                const rate = await fetchUsdEurRateForToday();
                els.incAddFxRate.value = String(rate);
                localStorage.setItem("fx_usd_eur_last", String(rate));
                setFxMsg(`Kurs (danas): ${rate}`);
            } catch (e) {
                const last = Number(localStorage.getItem("fx_usd_eur_last"));
                if (Number.isFinite(last) && last > 0) {
                    els.incAddFxRate.value = String(last);
                    setFxMsg(`Ne mogu povući kurs. Koristim zadnji: ${last}`);
                } else {
                    setFxMsg("Ne mogu povući kurs. Unesi ručno.");
                }
            }
        }
    });

    els.btnFetchFx?.addEventListener("click", async () => {
        try {
            setFxMsg("Učitavam kurs…");
            const rate = await fetchUsdEurRateForToday();
            els.incAddFxRate.value = String(rate);
            localStorage.setItem("fx_usd_eur_last", String(rate));
            setFxMsg(`Kurs (danas): ${rate}`);
        } catch {
            setFxMsg("Ne mogu povući kurs. Unesi ručno.");
        }
    });

    toggleFieldsByPlatform();
    toggleFieldsByApartment();
}

attach();
withLoading(async () => { await render(); });
