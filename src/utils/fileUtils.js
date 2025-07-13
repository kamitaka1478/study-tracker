// src/utils/fileUtils.js
const fs = require('fs-extra');

// JSONファイルを安全に読み込む
exports.readJsonFile = async (filePath) => {
  try {
    const data = await fs.readJson(filePath);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`JSONファイル読み込みエラー (${filePath}):`, error);
    return [];
  }
};

// JSONファイルに安全に書き込む
exports.writeJsonFile = async (filePath, data) => {
  try {
    await fs.writeJson(filePath, data, { spaces: 2 });
    return true;
  } catch (error) {
    console.error(`JSONファイル書き込みエラー (${filePath}):`, error);
    throw error;
  }
};

// データディレクトリの初期化
exports.initializeDataDirectory = async () => {
  const DATA_DIR = './data';
  await fs.ensureDir(DATA_DIR);
  
  const files = ['studyItems.json', 'logs.json'];
  for (const file of files) {
    const filePath = `${DATA_DIR}/${file}`;
    if (!await fs.pathExists(filePath)) {
      await fs.writeJson(filePath, [], { spaces: 2 });
      console.log(`📁 ${file} を作成しました`);
    }
  }
  
  console.log('✅ データファイルの初期化完了');
};
