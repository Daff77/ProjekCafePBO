/**
 * Date/time policy for NomCherry Café.
 * Timestamps are stored in UTC; all business-day, expiry, receipt-code, and
 * period calculations use a single configurable fixed offset (default Asia/Jakarta, UTC+7).
 */

let customClock = null;

function getOffsetMinutes() {
    const parsed = Number(process.env.APP_TZ_OFFSET_MINUTES);
    return Number.isFinite(parsed) ? parsed : 420;
}

function setClock(fnOrValue) {
    if (typeof fnOrValue === 'function') {
        customClock = fnOrValue;
    } else if (typeof fnOrValue === 'number' && Number.isFinite(fnOrValue)) {
        customClock = () => fnOrValue;
    } else if (typeof fnOrValue === 'string' || fnOrValue instanceof Date) {
        const ms = new Date(fnOrValue).getTime();
        customClock = Number.isFinite(ms) ? () => ms : null;
    } else {
        customClock = null;
    }
}

function resetClock() {
    customClock = null;
}

function nowMs() {
    return customClock ? customClock() : Date.now();
}

function nowIso() {
    return new Date(nowMs()).toISOString();
}

function sqlModifier() {
    const offset = getOffsetMinutes();
    const sign = offset >= 0 ? '+' : '';
    return `${sign}${offset} minutes`;
}

function today(refMs = nowMs()) {
    return new Date(refMs + getOffsetMinutes() * 60000).toISOString().slice(0, 10);
}

function isValidDateString(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

    const [yStr, mStr, dStr] = trimmed.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    const day = Number(dStr);

    if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }

    const dt = new Date(Date.UTC(year, month - 1, day));
    return (
        dt.getUTCFullYear() === year &&
        dt.getUTCMonth() + 1 === month &&
        dt.getUTCDate() === day
    );
}

function validateDateParam(value, fieldLabel = 'Tanggal') {
    if (value === undefined || value === null || String(value).trim() === '') {
        return { valid: true, value: null };
    }
    const trimmed = String(value).trim();
    if (!isValidDateString(trimmed)) {
        return {
            valid: false,
            message: `${fieldLabel} tidak valid. Gunakan tanggal kalender sah berformat YYYY-MM-DD.`
        };
    }
    return { valid: true, value: trimmed };
}

function addDays(ymd, deltaDays) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + Number(deltaDays)));
    return dt.toISOString().slice(0, 10);
}

function daysBetween(startYmd, endYmd) {
    const [y1, m1, d1] = String(startYmd).split('-').map(Number);
    const [y2, m2, d2] = String(endYmd).split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Expiry policy:
 * - tanggal_kadaluarsa < businessToday  => EXPIRED (blocked from sale)
 * - tanggal_kadaluarsa == businessToday => Valid through end of today (days_until_expiry = 0, near-expiry warning)
 * - 1..7 days remaining                 => Near-expiry warning
 */
function evaluateExpiry(expDateStr, refToday = today()) {
    if (!expDateStr || !isValidDateString(String(expDateStr).trim())) {
        return {
            tanggal_kadaluarsa: expDateStr || null,
            days_until_expiry: null,
            is_expired: false,
            is_near_expiry: false
        };
    }
    const normalized = String(expDateStr).trim();
    const days = daysBetween(refToday, normalized);
    const isExpired = days < 0;
    const isNearExpiry = !isExpired && days <= 7;
    return {
        tanggal_kadaluarsa: normalized,
        days_until_expiry: days,
        is_expired: isExpired,
        is_near_expiry: isNearExpiry
    };
}

function resolveRange(rangeKey, refToday = today()) {
    const key = ['today', '7d', '30d'].includes(rangeKey) ? rangeKey : 'today';
    if (key === '7d') {
        return {
            range: '7d',
            label: '7 Hari Terakhir',
            date_start: addDays(refToday, -6),
            date_end: refToday,
            prev_start: addDays(refToday, -13),
            prev_end: addDays(refToday, -7),
            days: 7,
            business_today: refToday
        };
    }
    if (key === '30d') {
        return {
            range: '30d',
            label: '30 Hari Terakhir',
            date_start: addDays(refToday, -29),
            date_end: refToday,
            prev_start: addDays(refToday, -59),
            prev_end: addDays(refToday, -30),
            days: 30,
            business_today: refToday
        };
    }
    return {
        range: 'today',
        label: 'Hari Ini',
        date_start: refToday,
        date_end: refToday,
        prev_start: addDays(refToday, -1),
        prev_end: addDays(refToday, -1),
        days: 1,
        business_today: refToday
    };
}

module.exports = {
    get OFFSET_MINUTES() {
        return getOffsetMinutes();
    },
    getOffsetMinutes,
    setClock,
    resetClock,
    nowMs,
    nowIso,
    sqlModifier,
    today,
    isValidDateString,
    validateDateParam,
    addDays,
    daysBetween,
    evaluateExpiry,
    resolveRange
};
