// js/income/income.page.js
import { dbDelete, dbGetAll, dbGetOne, dbGetOneByIndex, dbPutOne, makeId } from "../db/db.js";
import { keyFromPeriod, periodKeyToYM, safeDate } from "../shared/utils.js";
import { debug } from "../shared/log.js";
import { FeeModels, Platforms } from "../shared/constants.js";
import { calculateManagedReservation } from "../shared/managed-income-calculator.js";
import {
    buildReservationFinancial,
    buildReservationFinancials,
    getReservationSegmentForPeriod,
} from "../shared/reservation-financial.service.js";
import {
    buildIncomePeriodView,
    computeIncomePeriodTotals,
} from "../shared/income-period-view.service.js";
import { getCommissionConfig } from "../shared/commission-rules.service.js";
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
    feeModelWrap: document.getElementById("feeModelWrap"),
    incAddFeeModel: document.getElementById("incAddFeeModel"),
    incAddPaid: document.getElementById("incAddPaid"),
    incAddCheckin: document.getElementById("incAddCheckin"),
    incAddCheckout: document.getElementById("incAddCheckout"),
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
// ---------- helpers ----------

function round2(x) {
    return Math.round((Number(x || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeAirbnbFeeModel(value) {
    return value === FeeModels.SINGLE_FEE
        ? FeeModels.SINGLE_FEE
        : FeeModels.SPLIT_FEE;
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

function toggleFeeModelField() {
    const apartment = els.incAddApt?.value || "";
    const platform = String(
        els.incAddPlatform?.value || ""
    ).toLowerCase();

    const show =
        apartment === "N" &&
        platform === Platforms.AIRBNB;

    els.feeModelWrap?.classList.toggle(
        "is-hidden",
        !show
    );

    if (!show && els.incAddFeeModel) {
        els.incAddFeeModel.value = FeeModels.SINGLE_FEE;
    }
}

function toggleFieldsByApartment() {
    const apt = els.incAddApt?.value || "A";
    const isN = apt === "N";

    // Period boravka se za sve apartmane unosi kroz Check-in i Check-out.
    els.datesWrap?.classList.toggle("is-hidden", false);

    if (els.incAddCheckin) {
        els.incAddCheckin.required = isN;
        els.incAddCheckin.disabled = false;
    }
    if (els.incAddCheckout) {
        els.incAddCheckout.required = isN;
        els.incAddCheckout.disabled = false;
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

    if (els.incAddFeeModel) {
        els.incAddFeeModel.value = FeeModels.SINGLE_FEE;
    }

    if (els.incAddCheckin) els.incAddCheckin.value = "";
    if (els.incAddCheckout) els.incAddCheckout.value = "";
    if (els.incAddNote) els.incAddNote.value = "";

    if (!keepPlatform && els.incAddPlatform) els.incAddPlatform.value = "airbnb";
    if (!keepApt && els.incAddApt) els.incAddApt.value = "A";

    toggleFieldsByPlatform();
    toggleFieldsByApartment();
    toggleFeeModelField();
    if (els.incAddPaid) els.incAddPaid.checked = (els.incAddPlatform?.value === "airbnb");
}

function openModal() {
    els.modal?.classList.remove("is-hidden");
    els.modal?.setAttribute("aria-hidden", "false");
    toggleFieldsByPlatform();
    toggleFieldsByApartment();
    toggleFeeModelField();

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

// ---------- reservation allocation helpers ----------
function getIncomeItemAllocation(item) {
    try {
        return buildReservationFinancial(item);
    } catch (error) {
        console.warn("Income stay allocation skipped", item?.id, error);
        return null;
    }
}

function getIncomeItemPeriodKeys(item) {
    return getIncomeItemAllocation(item)?.periodKeys || new Set();
}

async function ensureIncomeItemAllocationPeriods(item) {
    const allocation = getIncomeItemAllocation(item);
    if (!allocation) return;

    for (const key of allocation.periodKeys) {
        const [year, month] = key.split("-").map(Number);
        await ensureImportPeriod(year, month);
    }
}

async function rebuildNCommissionForPeriod(year, month) {
    const items = await dbGetAll("income_items");
    const nItems = items.filter(it => it.apartment === "N");
    const allocations = buildReservationFinancials(nItems, {
        onError: (item, error) =>
            console.warn("Income stay allocation skipped", item?.id, error),
    });

    let incomeNTotal = 0;
    let bookingFeeTotal = 0;
    let ownerTotal = 0;
    let commissionTotal = 0;
    let lastPlatform = null;

    for (const allocation of allocations) {
        const segment = getReservationSegmentForPeriod(allocation, year, month);
        if (!segment) continue;

        incomeNTotal += Number(segment.splitBaseEur || 0) || 0;
        ownerTotal += Number(segment.ownerIncomeEur || 0) || 0;
        commissionTotal += Number(segment.agencyCommissionEur || 0) || 0;
        bookingFeeTotal += Number(segment.platformFeeEur || 0) || 0;

        lastPlatform =
            String(allocation.reservation?.platform || "").toLowerCase() || lastPlatform;
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
    if (els.incAddFeeModel) {
        els.incAddFeeModel.value =
            item.feeModel === FeeModels.SINGLE_FEE
                ? FeeModels.SINGLE_FEE
                : FeeModels.SPLIT_FEE;
    }
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
    toggleFeeModelField();
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
        const affectedPeriods = item.apartment === "N"
            ? getIncomeItemPeriodKeys(item)
            : new Set();

        await dbDelete("income_items", item.id);

        for (const key of affectedPeriods) {
            const [year, month] = key.split("-").map(Number);
            await rebuildNCommissionForPeriod(year, month);
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
    let selectedFeeModel = null;
    let cleaningFeeSnapshot = null;
    let platformFeePctSnapshot = null;

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
            cleaningFeeSnapshot = calculation.cleaningFee;
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
            cleaningFeeSnapshot = calculation.cleaningFee;
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
            selectedFeeModel = normalizeAirbnbFeeModel(
                els.incAddFeeModel?.value
            );

            if (selectedFeeModel === FeeModels.SPLIT_FEE) {
                cleaningFeeSnapshot = 10;
                platformFeePctSnapshot = 3;

                grossAmount = eur;
                platformFee = 0;
                splitBase = eur - cleaningFeeSnapshot;

                if (!Number.isFinite(splitBase) || splitBase <= 0) {
                    return alert("Osnovica za raspodjelu mora biti veća od 0.");
                }

                amountToStore = splitBase;
            } else {
                const config = await getCommissionConfig({
                    apartmentId: apartment,
                    platform: Platforms.AIRBNB,
                    feeModel: FeeModels.SINGLE_FEE,
                });

                const cleaningFee = Number(config?.cleaningFeeEur);

                const configuredPlatformFeePct =
                    Number(config?.platformFeePct);

                platformFeePctSnapshot =
                    Number.isFinite(configuredPlatformFeePct) &&
                    configuredPlatformFeePct > 0
                        ? configuredPlatformFeePct
                        : 15.5;

                if (
                    !Number.isFinite(cleaningFee) ||
                    cleaningFee <= 0
                ) {
                    return alert(
                        "Nije podešen validan Airbnb Cleaning Fee za ovaj apartman. " +
                        "Otvorite Settings i unesite Cleaning Fee veći od 0 EUR."
                    );
                }

                let calculation;

                try {
                    calculation = calculateManagedReservation({
                        platform: Platforms.AIRBNB,
                        feeModel: FeeModels.SINGLE_FEE,
                        grossAmount: eur,
                        cleaningFee,
                    });
                } catch (error) {
                    return alert(
                        error?.message ||
                        "NET mora biti > 0 (provjeri unos)."
                    );
                }

                amountToStore = calculation.splitBase;
                splitBase = calculation.splitBase;
                grossAmount = calculation.grossAmount;
                platformFee = calculation.platformFee;
                cleaningFeeSnapshot = calculation.cleaningFee;
            }
        }

        else {
            // ✅ A/Z Airbnb/direct/other: unos = kompletan prihod
            amountToStore = eur;

            // Direct/Other nema platform fee.
            // CF se prvo izdvaja, ostatak ide u raspodjelu.
            if (isN) {
                cleaningFeeSnapshot = 10;
                splitBase = eur - cleaningFeeSnapshot;

                if (!(Number.isFinite(splitBase) && splitBase > 0)) {
                    return alert("Osnovica za N mora biti > 0.");
                }

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
        if (!checkin || !checkout) {
            return alert("Za apartmane A/Z unesi Check-in i Check-out.");
        }
        const a = safeDate(checkin);
        const b = safeDate(checkout);
        if (!a || !b || b.getTime() <= a.getTime()) {
            return alert("Check-out mora biti poslije check-in datuma.");
        }
        nights = nightsFromDates(checkin, checkout);
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
                ? selectedFeeModel
                : null,

        cleaningFeeEur:
            isN && Number.isFinite(cleaningFeeSnapshot)
                ? round2(cleaningFeeSnapshot)
                : null,

        platformFeePct:
            platform === Platforms.AIRBNB && isN &&
            Number.isFinite(platformFeePctSnapshot)
                ? platformFeePctSnapshot
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
        await ensureIncomeItemAllocationPeriods(item);
        if (existingItem) {
            await ensureIncomeItemAllocationPeriods(existingItem);
        }

        // --- N: rebuild all months affected by the old/new stay period ---
        const affectedPeriods = new Set();
        if (existingItem?.apartment === "N") {
            for (const key of getIncomeItemPeriodKeys(existingItem)) {
                affectedPeriods.add(key);
            }
        }
        if (isN) {
            for (const key of getIncomeItemPeriodKeys(item)) {
                affectedPeriods.add(key);
            }
        }

        for (const key of affectedPeriods) {
            const [year, month] = key.split("-").map(Number);
            await rebuildNCommissionForPeriod(year, month);
        }

        // Nakon snimanja prikaži mjesec check-ina.
        state.selectedCalendarYear = period.year;
        state.selectedPeriodKey = keyFromPeriod(period.year, period.month);
        state.isYearView = false;

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
    const [incomeMonthly, incomeItems, imports] = await Promise.all([
        dbGetAll("income_monthly"),
        dbGetAll("income_items").catch(() => []),
        dbGetAll("imports"),
    ]);
    return { incomeMonthly, incomeItems, imports };
}

function applyMonthlyFallbackFilters(
    incomeMonthly,
    aptFilter,
    year,
    month = null,
    isYearView = false
) {
    let rows = [...(incomeMonthly || [])];

    rows = rows.filter((row) => {
        if (Number(row.year) !== Number(year)) return false;

        return (
            isYearView ||
            Number(row.month) === Number(month)
        );
    });

    if (aptFilter && aptFilter !== "ALL") {
        rows = rows.filter(row => row.apartment === aptFilter);
    }

    return rows;
}

function buildCurrentIncomeView(data, aptFilter, platformFilter) {
    let year;
    let month = null;

    if (state.isYearView) {
        year = state.selectedCalendarYear || new Date().getFullYear();
    } else if (state.selectedPeriodKey) {
        const period = periodKeyToYM(state.selectedPeriodKey);
        year = period.year;
        month = period.month;
    } else {
        year = state.selectedCalendarYear || new Date().getFullYear();
    }

    const filteredItems = buildIncomePeriodView(
        data.incomeItems,
        {
            year,
            month,
            isYearView: state.isYearView,
            apartment: aptFilter,
            platform: platformFilter,
            onError(item, error) {
                console.error(
                    "[income.page] Ne mogu izgraditi prikaz rezervacije:",
                    item?.id,
                    error
                );
            },
        }
    );

    const filteredMonthly = applyMonthlyFallbackFilters(
        data.incomeMonthly,
        aptFilter,
        year,
        month,
        state.isYearView
    );

    return {
        filteredItems,
        filteredMonthly,
    };
}

function computeCurrentIncomeSums(filteredMonthly, filteredItems) {
    if (filteredItems.length > 0) {
        return computeIncomePeriodTotals(filteredItems);
    }

    const sumsAZN = {
        A: { income: 0, nights: 0 },
        Z: { income: 0, nights: 0 },
        N: { income: 0, nights: 0 },
    };

    for (const row of filteredMonthly || []) {
        if (!sumsAZN[row.apartment]) continue;

        sumsAZN[row.apartment].income +=
            Number(row.income_eur || 0) || 0;

        sumsAZN[row.apartment].nights +=
            Number(row.nights || 0) || 0;
    }

    const nBreakdown = {
        income_total: round2(sumsAZN.N.income),
        my_commission: round2(sumsAZN.N.income),
        owner: 0,
    };

    const total = {
        income: round2(
            sumsAZN.A.income +
            sumsAZN.Z.income +
            sumsAZN.N.income
        ),
        nights:
            sumsAZN.A.nights +
            sumsAZN.Z.nights +
            sumsAZN.N.nights,
    };

    return {
        sumsAZN,
        nBreakdown,
        total,
    };
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

    const { filteredMonthly, filteredItems } = buildCurrentIncomeView(
        data,
        state.apt,
        state.platform
    );

    const { sumsAZN, nBreakdown, total } =
        computeCurrentIncomeSums(
            filteredMonthly,
            filteredItems
        );

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

    els.incAddApt?.addEventListener("change", () => {
        toggleFieldsByApartment();
        toggleFeeModelField();
    });

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
        toggleFeeModelField();

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
