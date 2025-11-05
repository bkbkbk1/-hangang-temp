const sharp = require('sharp');
const fs = require('fs');

async function convertSVGtoPNG() {
  try {
    const svgBuffer = fs.readFileSync('./public/icon.svg');

    await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile('./public/icon.png');

    console.log('✅ icon.png 생성 완료!');
    console.log('📁 위치: public/icon.png');
  } catch (error) {
    console.error('❌ 변환 실패:', error);
  }
}

convertSVGtoPNG();
