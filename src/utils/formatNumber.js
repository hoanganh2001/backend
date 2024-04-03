function formatNumber(value, sign) {
  return value.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, sign);
}

module.exports = formatNumber;
