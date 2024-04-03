function doc3So(numb) {
  var numbName = [
    'Không',
    'Một',
    'Hai',
    'Ba',
    'Bốn',
    'Năm',
    'Sáu',
    'Bảy',
    'Tám',
    'Chín',
  ];
  var result = numb
    .toString()
    .split('')
    .reverse()
    .map((val, index) => {
      let level = ['', ' Mươi', ' Trăm'];
      return numbName[val - 0] + level[index];
    })
    .reverse()
    .join(' ')
    .replace('Không Mươi', 'Linh')
    .replace('Một Mươi', 'Mười')
    .replace('Mươi Không', 'Mươi')
    .replace('Mười Không', 'Mười')
    .replace('Mươi Năm', 'Mươi Lăm')
    .replace('Mươi Bốn', 'Mươi Tư')
    .replace('Linh Bốn', 'Linh Tư')
    .replace(' Linh Không', '');
  return result;
}

function docNhieuSo(numb) {
  return (result = numb
    ?.toLocaleString('en')
    .split(',')
    .reverse()
    .map((val, index) => {
      let level = ['', ' Nghìn', ' Triệu', ' Tỉ', ' Nghìn', ' Triệu'];
      if (!(val - 0)) {
        if (index === 3) {
          return level[index];
        }
        return '';
      }
      return doc3So(val) + level[index];
    })
    .reverse()
    .join(' ')
    .trim()
    .replace('  ', ' '));
}

module.exports = docNhieuSo;
