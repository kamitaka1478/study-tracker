// src/controllers/logsController.js
const { readJsonFile, writeJsonFile } = require('../utils/fileUtils');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const LOGS_FILE = path.join('./data', 'logs.json');
const STUDY_ITEMS_FILE = path.join('./data', 'studyItems.json');

// 学習ログ一覧を取得（フィルター機能付き）
exports.getAll = async (req, res, next) => {
  try {
    const { studyItemId, startDate, endDate, limit } = req.query;
    
    let data = await readJsonFile(LOGS_FILE);
    
    // フィルター適用
    if (studyItemId) {
      data = data.filter(log => log.studyItemId === studyItemId);
    }
    
    if (startDate) {
      data = data.filter(log => log.date >= startDate);
    }
    
    if (endDate) {
      data = data.filter(log => log.date <= endDate);
    }
    
    // 日付順でソート（新しい順）
    data.sort((a, b) => {
      const dateA = new Date(b.date) - new Date(a.date);
      if (dateA !== 0) return dateA;
      // 同じ日付の場合は作成時刻順
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    // 件数制限
    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) {
        data = data.slice(0, limitNum);
      }
    }
    
    res.json(data);
  } catch (error) {
    next(error);
  }
};

// 学習ログを作成
exports.create = async (req, res, next) => {
  try {
    const { studyItemId, date, content, duration, memo, tags } = req.body;

    // バリデーション
    if (!studyItemId || !date || !content || !duration) {
      const error = new Error('studyItemId, date, content, duration は必須です');
      error.statusCode = 400;
      throw error;
    }

    // 数値チェック
    const durationNum = parseInt(duration);
    if (isNaN(durationNum) || durationNum <= 0) {
      const error = new Error('学習時間は正の数値で入力してください');
      error.statusCode = 400;
      throw error;
    }

    // 日付チェック
    if (isNaN(Date.parse(date))) {
      const error = new Error('正しい日付形式で入力してください');
      error.statusCode = 400;
      throw error;
    }

    // 学習項目の存在確認
    const studyItems = await readJsonFile(STUDY_ITEMS_FILE);
    const studyItemExists = studyItems.some(item => item.id === studyItemId);
    
    if (!studyItemExists) {
      const error = new Error('指定された学習項目が見つかりません');
      error.statusCode = 404;
      throw error;
    }

    const newLog = {
      id: uuidv4(),
      studyItemId,
      date,
      content: content.trim(),
      duration: durationNum,
      memo: memo ? memo.trim() : '',
      tags: Array.isArray(tags) ? tags.map(t => t.trim()).filter(t => t) : [],
      createdAt: new Date().toISOString()
    };

    const data = await readJsonFile(LOGS_FILE);
    data.push(newLog);
    await writeJsonFile(LOGS_FILE, data);
    
    const studyItem = studyItems.find(item => item.id === studyItemId);
    console.log(`📝 学習ログ追加: ${studyItem?.name || '不明'} - ${content} (${durationNum}分)`);
    res.status(201).json({ success: true, data: newLog });
  } catch (error) {
    next(error);
  }
};

// 学習ログを更新
exports.update = async (req, res, next) => {
  try {
    const logId = req.params.id;
    const { studyItemId, date, content, duration, memo, tags } = req.body;

    // バリデーション（createと同じ）
    if (!studyItemId || !date || !content || !duration) {
      const error = new Error('studyItemId, date, content, duration は必須です');
      error.statusCode = 400;
      throw error;
    }

    const durationNum = parseInt(duration);
    if (isNaN(durationNum) || durationNum <= 0) {
      const error = new Error('学習時間は正の数値で入力してください');
      error.statusCode = 400;
      throw error;
    }

    if (isNaN(Date.parse(date))) {
      const error = new Error('正しい日付形式で入力してください');
      error.statusCode = 400;
      throw error;
    }

    // 学習項目の存在確認
    const studyItems = await readJsonFile(STUDY_ITEMS_FILE);
    const studyItemExists = studyItems.some(item => item.id === studyItemId);
    
    if (!studyItemExists) {
      const error = new Error('指定された学習項目が見つかりません');
      error.statusCode = 404;
      throw error;
    }

    let data = await readJsonFile(LOGS_FILE);
    const index = data.findIndex(log => log.id === logId);
    
    if (index === -1) {
      const error = new Error('指定されたログが見つかりません');
      error.statusCode = 404;
      throw error;
    }

    // ログを更新
    const updatedLog = {
      ...data[index],
      studyItemId,
      date,
      content: content.trim(),
      duration: durationNum,
      memo: memo ? memo.trim() : '',
      tags: Array.isArray(tags) ? tags.map(t => t.trim()).filter(t => t) : [],
      updatedAt: new Date().toISOString()
    };

    data[index] = updatedLog;
    await writeJsonFile(LOGS_FILE, data);
    
    const studyItem = studyItems.find(item => item.id === studyItemId);
    console.log(`✏️ 学習ログ更新: ${studyItem?.name || '不明'} - ${content} (${durationNum}分)`);
    res.json({ success: true, data: updatedLog });
  } catch (error) {
    next(error);
  }
};

// 学習ログを削除
exports.delete = async (req, res, next) => {
  try {
    const logId = req.params.id;
    
    let data = await readJsonFile(LOGS_FILE);
    const originalLength = data.length;
    const newData = data.filter(log => log.id !== logId);
    
    if (newData.length === originalLength) {
      const error = new Error('指定されたログが見つかりません');
      error.statusCode = 404;
      throw error;
    }
    
    await writeJsonFile(LOGS_FILE, newData);
    
    console.log(`🗑️ 学習ログ削除: ID ${logId}`);
    res.json({ 
      success: true,
      message: 'ログを削除しました' 
    });
  } catch (error) {
    next(error);
  }
};
