// src/controllers/studyItemsController.js
const { readJsonFile, writeJsonFile } = require('../utils/fileUtils');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const STUDY_ITEMS_FILE = path.join('./data', 'studyItems.json');

// すべての学習項目を取得
exports.getAll = async (req, res, next) => {
  try {
    const data = await readJsonFile(STUDY_ITEMS_FILE);
    // 作成日時順でソート（新しい順）
    const sortedData = data.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(sortedData);
  } catch (error) {
    next(error);
  }
};

// 学習項目を作成
exports.create = async (req, res, next) => {
  try {
    const { name, category } = req.body;

    // バリデーション
    if (!name || !category) {
      const error = new Error('name と category を入力してください');
      error.statusCode = 400;
      throw error;
    }

    const newItem = {
      id: uuidv4(),
      name: name.trim(),
      category: category.trim(),
      createdAt: new Date().toISOString()
    };

    const data = await readJsonFile(STUDY_ITEMS_FILE);
    
    // 重複チェック
    const exists = data.some(item => 
      item.name.toLowerCase() === newItem.name.toLowerCase() &&
      item.category.toLowerCase() === newItem.category.toLowerCase()
    );
    
    if (exists) {
      const error = new Error('同じ名前とカテゴリの学習項目が既に存在します');
      error.statusCode = 409;
      throw error;
    }
    
    data.push(newItem);
    await writeJsonFile(STUDY_ITEMS_FILE, data);
    
    console.log(`➕ 学習項目追加: ${newItem.name} (${newItem.category})`);
    res.status(201).json({ success: true, data: newItem });
  } catch (error) {
    next(error);
  }
};

// 学習項目を更新
exports.update = async (req, res, next) => {
  try {
    const itemId = req.params.id;
    const { name, category } = req.body;

    // バリデーション
    if (!name || !category) {
      const error = new Error('name と category は必須です');
      error.statusCode = 400;
      throw error;
    }

    let data = await readJsonFile(STUDY_ITEMS_FILE);
    const index = data.findIndex(item => item.id === itemId);

    if (index === -1) {
      const error = new Error('指定された学習項目が見つかりません');
      error.statusCode = 404;
      throw error;
    }

    // 重複チェック (自分自身を除く)
    const exists = data.some(item =>
      item.id !== itemId &&
      item.name.toLowerCase() === name.trim().toLowerCase() &&
      item.category.toLowerCase() === category.trim().toLowerCase()
    );

    if (exists) {
      const error = new Error('同じ名前とカテゴリの学習項目が既に存在します');
      error.statusCode = 409;
      throw error;
    }

    // 学習項目を更新
    const updatedItem = {
      ...data[index],
      name: name.trim(),
      category: category.trim(),
      updatedAt: new Date().toISOString()
    };

    data[index] = updatedItem;
    await writeJsonFile(STUDY_ITEMS_FILE, data);

    console.log(`✏️ 学習項目更新: ID ${itemId} - ${updatedItem.name} (${updatedItem.category})`);
    res.json({ success: true, data: updatedItem });
  } catch (error) {
    next(error);
  }
};

// 学習項目を削除
exports.delete = async (req, res, next) => {
  try {
    const itemId = req.params.id;

    let data = await readJsonFile(STUDY_ITEMS_FILE);
    const originalLength = data.length;
    const newData = data.filter(item => item.id !== itemId);

    if (newData.length === originalLength) {
      const error = new Error('指定された学習項目が見つかりません');
      error.statusCode = 404;
      throw error;
    }

    await writeJsonFile(STUDY_ITEMS_FILE, newData);

    console.log(`🗑️ 学習項目削除: ID ${itemId}`);
    res.json({
      success: true,
      message: '学習項目を削除しました'
    });
  } catch (error) {
    next(error);
  }
};
