/**
 * Date/time policy for NomCherry Café.
 * Timestamps are stored in UTC; business-day calculations use a configurable
 * fixed offset (default Asia/Jakarta, UTC+7).
 */

const OFFSET_MINUTES = Number.isFinite(Number(process.env.APP_TZ_OFFSET_MINUTES))
    ? Number(process.env.APP_TZ_OFFSET_MINUTES)
    : 420;

function sqlModifier() {
    const sign = OFFSET_MINUTES >= 0 ? '+' : '';
    return `${sign}${OFFSET_MINUTES} minutes`;
}

function today() {
    return new Date(Date.now() + OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
}

function nowIso() {
    return new Date().toISOString();
}

module.exports = {
    OFFSET_MINUTES,
    sqlModifier,
    today,
    nowIso
};
