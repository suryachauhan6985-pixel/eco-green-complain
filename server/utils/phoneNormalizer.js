/**
 * Standard Phone Number Normalizer for Indian Numbers (+91)
 * Guarantees uniform database storage, indexing, and deduplication.
 */

function normalizePhone(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10) return '91' + clean;
  if (clean.length === 12 && clean.startsWith('91')) return clean;
  if (clean.length > 10) {
    return '91' + clean.slice(-10);
  }
  return clean;
}

function getLast10Digits(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  return clean.length >= 10 ? clean.slice(-10) : clean;
}

function formatDisplayPhone(phone) {
  const last10 = getLast10Digits(phone);
  if (last10.length === 10) {
    return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return phone ? `+${String(phone).replace(/\D/g, '')}` : '';
}

module.exports = {
  normalizePhone,
  getLast10Digits,
  formatDisplayPhone
};
