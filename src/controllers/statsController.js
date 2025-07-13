// src/controllers/statsController.js
const { readJsonFile } = require('../utils/fileUtils');
const path = require('path');

const STUDY_ITEMS_FILE = path.join('./data', 'studyItems.json');
const LOGS_FILE = path.join('./data', 'logs.json');

// 学習統計を取得
exports.getStats = async (req, res, next) => {
try {
const studyItems = await readJsonFile(STUDY_ITEMS_FILE);
const logs = await readJsonFile(LOGS_FILE);

// 総学習時間の計算
const totalTime = logs.reduce((sum, log) => sum + (log.duration || 0), 0);
const totalHours = Math.round(totalTime / 60 * 100) / 100;

// カテゴリ別統計
const categoryStats = {};
studyItems.forEach(item => {
  const itemLogs = logs.filter(log => log.studyItemId === item.id);
  const categoryTime = itemLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
  
  if (!categoryStats[item.category]) {
    categoryStats[item.category] = {
      items: 0,
      logs: 0,
      totalTime: 0
    };
  }
  
  categoryStats[item.category].items++;
  categoryStats[item.category].logs += itemLogs.length;
  categoryStats[item.category].totalTime += categoryTime;
});

// 学習連続日数の計算
let studyStreak = 0;
if (logs.length > 0) {
  const sortedLogs = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const uniqueStudyDates = new Set();
  sortedLogs.forEach(log => {
    uniqueStudyDates.add(log.date.split('T')[0]);
  });

  const datesArray = Array.from(uniqueStudyDates).sort();
  
  if (datesArray.length > 0) {
    let currentStreak = 0;
    let lastDate = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let hasStudyTodayOrYesterday = false;
    if (uniqueStudyDates.has(todayStr)) {
      currentStreak = 1;
      hasStudyTodayOrYesterday = true;
      lastDate = today;
    } else if (uniqueStudyDates.has(yesterdayStr)) {
      currentStreak = 1;
      hasStudyTodayOrYesterday = true;
      lastDate = yesterday;
    } else {
      studyStreak = 0;
    }

    if (hasStudyTodayOrYesterday) {
      for (let i = datesArray.length - 1; i >= 0; i--) {
        const logDate = new Date(datesArray[i]);
        logDate.setHours(0, 0, 0, 0);

        if (logDate.getTime() === lastDate.getTime()) {
          continue;
        }

        const prevDay = new Date(lastDate);
        prevDay.setDate(lastDate.getDate() - 1);

        if (logDate.getTime() === prevDay.getTime()) {
          currentStreak++;
          lastDate = logDate;
        } else if (logDate.getTime() < prevDay.getTime()) {
          break;
        }
      }
      studyStreak = currentStreak;
    }
  }
}

res.json({
  totalItems: studyItems.length,
  totalLogs: logs.length,
  totalTime: totalTime,
  totalHours: totalHours,
  categoryStats: categoryStats,
  studyStreak: studyStreak
});
} catch (error) {
next(error);
}
};
