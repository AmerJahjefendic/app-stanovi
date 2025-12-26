// js/income/income.page.js
import { dbGetAll, dbGetOne, dbGetOneByIndex, dbPutOne, makeId } from "../db/db.js";
import { keyFromPeriod, periodKeyToYM, safeDate } from "../shared/utils.js";
import { debug } from "../shared/log.js";
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
// booking_fee_eur u n_commission = PLATFORM FEE (Booking fee ili Airbnb fee), VRBO=0
function calcNBreakdown({
    platform,
    gross_reservation_eur = 0, // tvoj unos (osnovica bez CF) za Airbnb/Booking
    net_to_us_eur = 0,         // net bez CF (tj. "nama ostaje" za raspodjelu)
    platform_fee_eur = 0       // booking fee ili airbnb fee
}) {
    const gross = Number(gross_reservation_eur || 0);
    const net = Number(net_to_us_eur || 0);
    const fee = Number(platform_fee_eur || 0);

    const owner = round2(net * 0.75);
    const commission = round2(net * 0.25 + CF_EUR);

    return {
        platform,
        gross_eur: round2(gross),          // unos (bez CF)
        net_eur: round2(net),              // ✅ NET nama (bez CF)
        booking_fee_eur: round2(fee),      // ✅ platform fee (Booking ili Airbnb)
        owner_eur: owner,
        commission_eur: commission,
    };
}

async function upsertNCommission(year, month, details) {
    const existing = await dbGetOneByIndex("n_commission", "by_period", [year, month]);

    const prevNet = Number(existing?.incomeN_eur_total || 0);
    const prevOwner = Number(existing?.owner_eur || 0) || 0;
    const prevComm = Number(existing?.commission_eur || 0) || 0;
    const prevFee = Number(existing?.booking_fee_eur || 0) || 0;

    const netDelta = Number(details?.net_eur || 0);
    const ownerDelta = Number(details?.owner_eur || 0) || 0;
    const commDelta = Number(details?.commission_eur || 0) || 0;
    const feeDelta = Number(details?.booking_fee_eur || 0) || 0;

    await dbPutOne("n_commission", {
        id: existing?.id || `ncomm_${year}_${String(month).padStart(2, "0")}`,
        year,
        month,

        // ovo je NET koji ostaje "nama" (payout / net after fee)
        incomeN_eur_total: round2(prevNet + netDelta),

        // platform fee (booking fee ili airbnb fee)
        booking_fee_eur: round2(prevFee + feeDelta),

        owner_eur: round2(prevOwner + ownerDelta),
        commission_eur: round2(prevComm + commDelta),

        platform: details?.platform || existing?.platform || null,
        updated_at: new Date().toISOString(),
    });
}

// ---------- ADD ITEM (core logic) ----------

async function handleAddIncomeItem() {
    debug("CLICK add income item");

    const apartment = els.incAddApt?.value || "A";
    const platform = (els.incAddPlatform?.value || "").toLowerCase();
    const isN = apartment === "N";

    let amountEur = 0;            // income_items.amount_eur (A/Z prihod; za N čuvamo NET koji ostaje nama)
    let grossReservationEur = 0;  // relevantno: Booking (gross) i N+Airbnb (gross reservation)
    let platformFeeEur = 0;       // relevantno: Booking fee (svima), Airbnb fee (samo N)
    let netToUsEur = 0;           // relevantno za N: net koji ostaje nama (payout / net after fee)

    // --- VRBO ---
    if (platform === "vrbo") {
        const usd = Number(els.incAddAmountUsd?.value || 0);
        const rate = Number(els.incAddFxRate?.value || 0);

        if (!Number.isFinite(usd) || usd <= 0) return alert("Unesi ispravan VRBO iznos (USD).");
        if (!Number.isFinite(rate) || rate <= 0) return alert("Unesi kurs USD→EUR (ili klikni ↻ Kurs).");

        let payoutEur = usd * rate;

        amountEur = payoutEur;        // za A/Z (ako ikad bude) ovo je prihod; za N ovo je net koji ostaje nama

        if (isN) {
            const gross = payoutEur;                 // GROSS u EUR (payout konvertovan)
            const netN = gross - CF_EUR;             // ✅ NET nama za raspodjelu (bez CF)
            if (!(Number.isFinite(netN) && netN > 0)) {
                return alert("NET za N mora biti > 0 (provjeri iznos/kurs).");
            }

            payoutEur = netN;                        // ✅ u income_items za N čuvamo NET nama (bez CF)
            netToUsEur = netN;                       // ✅ u n_commission ide NET nama (bez CF)
            platformFeeEur = 0;                      // VRBO fee nemamo (0)
            grossReservationEur = 0;                 // nemamo reservation gross, imamo payout
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

        grossReservationEur = gross;
        platformFeeEur = fee;

        if (isN) {
            const netN = gross - fee - CF_EUR;
            if (!(Number.isFinite(netN) && netN > 0)) return alert("NET za N mora biti > 0 (provjeri fee).");

            amountEur = netN;     // ✅ u items za N čuvamo NET nama (bez CF)
            netToUsEur = netN;    // ✅ u n_commission ide NET nama (bez CF)
        } else {
            amountEur = netForApt; // ✅ A/Z
        }
    }

    // --- AIRBNB / DIRECT / OTHER ---
    else {
        const eur = Number(els.incAddAmount?.value || 0);
        if (!Number.isFinite(eur) || eur <= 0) return alert("Unesi ispravan iznos (EUR).");

        // ✅ N + Airbnb: unos = reservation price (bez CF)
        if (platform === "airbnb" && isN) {
            // Unos (eur) = cijena rezervacije BEZ cleaning fee (CF)
            grossReservationEur = eur;

            // Airbnb fee se računa na (rezervacija + CF)
            platformFeeEur = (grossReservationEur + CF_EUR) * 0.03;

            // ✅ Ispravno: payout (NET nama) uključuje i CF, pa tek poslije raspodjela skida CF
            const payoutNetToUs = (grossReservationEur) - platformFeeEur;

            if (!Number.isFinite(payoutNetToUs) || payoutNetToUs <= 0) {
                return alert("NET mora biti > 0 (provjeri unos).");
            }

            // Za N u items čuvamo NET nama (payout), ne net bez CF
            amountEur = payoutNetToUs;
            netToUsEur = payoutNetToUs;
        }
        else {
            // ✅ A/Z Airbnb/direct/other: unos = kompletan prihod
            amountEur = eur;

            // ✅ N direct/other: tretiraj kao net koji ostaje nama
            if (isN) {
                netToUsEur = eur;
                platformFeeEur = 0;
                grossReservationEur = 0;
            }
        }
    }

    // --- dates/nights validation ---
    const checkin = els.incAddCheckin?.value || "";
    const checkout = els.incAddCheckout?.value || "";
    const note = (els.incAddNote?.value || "").trim();
    const period = periodFromInputsOrSelected(checkin);

    const nightsInputRaw = els.incAddNights?.value;
    let nights = 0;

    if (isN) {
        if (!checkin || !checkout) return alert("Za apartman N moraš unijeti i Check-in i Check-out (obavezno radi izvještaja).");
        const a = safeDate(checkin);
        const b = safeDate(checkout);
        if (!a || !b || b.getTime() <= a.getTime()) return alert("Check-out mora biti poslije check-in datuma.");
        nights = nightsFromDates(checkin, checkout);
    } else {
        const hasManualNights = (nightsInputRaw !== "" && nightsInputRaw != null);
        if (hasManualNights) {
            const nn = Number(nightsInputRaw);
            nights = Number.isFinite(nn) ? Math.max(0, Math.round(nn)) : 0;
        } else if (checkin && checkout) {
            const a = safeDate(checkin);
            const b = safeDate(checkout);
            if (!a || !b || b.getTime() <= a.getTime()) return alert("Check-out mora biti poslije check-in datuma.");
            nights = nightsFromDates(checkin, checkout);
        } else {
            return alert("Za apartmane A/Z unesi ili Noćenja ili oba datuma (Check-in i Check-out).");
        }
    }

    // --- persist item ---
    const item = {
        id: makeId("incit"),
        year: period.year,
        month: period.month,
        apartment,
        platform,

        // NET koji se knjiži za A/Z; za N čuvamo net koji ostaje nama
        amount_eur: round2(amountEur),

        // Future/debug fields (ne traže DB migraciju)
        gross_eur: (platform === "booking" || (platform === "airbnb" && isN)) ? round2(grossReservationEur) : null,
        platform_fee_eur: (platform === "booking" || (platform === "airbnb" && isN)) ? round2(platformFeeEur) : null,

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
        created_at: new Date().toISOString(),
    };

    try {
        await dbPutOne("income_items", item);
        await ensureImportPeriod(period.year, period.month);

        // --- N: upsert n_commission ---
        if (isN) {
            const details = calcNBreakdown({
                platform,
                gross_reservation_eur: grossReservationEur,
                net_to_us_eur: netToUsEur,
                platform_fee_eur: platformFeeEur,
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
