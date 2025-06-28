require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET;

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(express.json());
// publicディレクトリを静的ファイルとして提供します。
// これにより、public/dashboard.html や public/study_management.html に直接アクセスできるようになります。
app.use(express.static('public'));

// CORS対応（開発環境用）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// ファイルパス
const DATA_DIR = './data';
const STUDY_ITEMS_FILE = path.join(DATA_DIR, 'studyItems.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// 初期化：dataディレクトリとJSONファイルを作成
async function initializeData() {
  try {
    // dataディレクトリを作成
    await fs.ensureDir(DATA_DIR);
    
    // studyItems.jsonが存在しない場合は作成
    if (!await fs.pathExists(STUDY_ITEMS_FILE)) {
      await fs.writeJson(STUDY_ITEMS_FILE, [], { spaces: 2 });
      console.log('📁 studyItems.json を作成しました');
    }
    
    // logs.jsonが存在しない場合は作成
    if (!await fs.pathExists(LOGS_FILE)) {
      await fs.writeJson(LOGS_FILE, [], { spaces: 2 });
      console.log('📁 logs.json を作成しました');
    }
    
    console.log('✅ データファイルの初期化完了');
  } catch (error) {
    console.error('❌ データファイル初期化エラー:', error);
  }
}

// JSONファイルを安全に読み込む関数
async function readJsonFile(filePath) {
  try {
    const data = await fs.readJson(filePath);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`JSONファイル読み込みエラー (${filePath}):`, error);
    return [];
  }
}

// JSONファイルに安全に書き込む関数
async function writeJsonFile(filePath, data) {
  try {
    await fs.writeJson(filePath, data, { spaces: 2 });
    return true;
  } catch (error) {
    console.error(`JSONファイル書き込みエラー (${filePath}):`, error);
    return false;
  }
}

// ルートハンドラー
// ブラウザからのルートURL (http://localhost:3000/) へのリクエストに対して、
// dashboard.html ファイルを返すように変更します。
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API情報エンドポイント (デバッグ用) - 必要であれば残す
app.get('/api-info', (req, res) => {
  res.json({
    message: '📚 学習記録アプリAPI',
    status: 'running',
    endpoints: {
      'GET /study-items': '学習項目一覧取得',
      'POST /study-items': '学習項目追加',
      'PUT /study-items/:id': '学習項目更新',
      'DELETE /study-items/:id': '学習項目削除',
      'GET /logs': '学習ログ一覧取得',
      'POST /logs': '学習ログ追加',
      'PUT /logs/:id': '学習ログ更新',
      'DELETE /logs/:id': '学習ログ削除',
      'GET /stats': '学習統計取得'
    }
  });
});

// === ユーザー認証 関連のAPI ===

// ユーザー登録
app.post('/auth/register', async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) {
    return res.status(400).json({ message: '全て必須です' });
  }
  try {
    // メール重複チェック
    const exists = await pool.query('SELECT 1 FROM users WHERE email = \$1', [email]);
    if (exists.rowCount > 0) {
      return res.status(409).json({ message: 'このメールアドレスは既に登録されています' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, username, password_hash) VALUES (\$1, \$2, \$3) RETURNING id, email, username, created_at',
      [email, username, hash]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'サーバーエラー' });
  }
});

// ログイン
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: '全て必須です' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = \$1', [email]);
    if (result.rowCount === 0) return res.status(401).json({ message: '認証失敗' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: '認証失敗' });
    // JWT発行
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, username: user.username } });
  } catch (err) {
    res.status(500).json({ message: 'サーバーエラー' });
  }
});

// 認証ミドルウェア
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: '認証が必要です' });
  try {
    const payload = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'トークンが無効です' });
  }
}

// ログイン中ユーザー情報取得
app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, username, created_at FROM users WHERE id = \$1', [req.user.userId]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'ユーザーが見つかりません' });
    res.json({ user: result.rows[0] });
  } catch {
    res.status(500).json({ message: 'サーバーエラー' });
  }
});


// === 学習項目 関連のAPI ===

// PUT /study-items/:id → 学習項目を更新
app.put('/study-items/:id', async (req, res) => {
  const itemId = req.params.id;
  const { name, category } = req.body;

  // バリデーション
  if (!name || !category) {
    return res.status(400).json({
      success: false,
      message: 'name と category は必須です'
    });
  }

  try {
    let data = await readJsonFile(STUDY_ITEMS_FILE);
    const index = data.findIndex(item => item.id === itemId);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: '指定された学習項目が見つかりません'
      });
    }

    // 重複チェック (自分自身を除く)
    const exists = data.some(item =>
      item.id !== itemId && // 自分自身はチェック対象外
      item.name.toLowerCase() === name.trim().toLowerCase() &&
      item.category.toLowerCase() === category.trim().toLowerCase()
    );

    if (exists) {
      return res.status(409).json({
        success: false,
        message: '同じ名前とカテゴリの学習項目が既に存在します'
      });
    }

    // 学習項目を更新
    const updatedItem = {
      ...data[index],
      name: name.trim(),
      category: category.trim(),
      updatedAt: new Date().toISOString() // 更新日時を追加
    };

    data[index] = updatedItem;
    const writeSuccess = await writeJsonFile(STUDY_ITEMS_FILE, data);

    if (writeSuccess) {
      console.log(`✏️ 学習項目更新: ID ${itemId} - ${updatedItem.name} (${updatedItem.category})`);
      res.json({ success: true, data: updatedItem });
    } else {
      res.status(500).json({
        success: false,
        message: '学習項目の更新に失敗しました'
      });
    }
  } catch (error) {
    console.error('学習項目更新エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
});

// DELETE /study-items/:id → 指定した学習項目を削除
app.delete('/study-items/:id', async (req, res) => {
  const itemId = req.params.id;

  try {
    let data = await readJsonFile(STUDY_ITEMS_FILE);
    const originalLength = data.length;
    const newData = data.filter(item => item.id !== itemId);

    if (newData.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: '指定された学習項目が見つかりません'
      });
    }

    const writeSuccess = await writeJsonFile(STUDY_ITEMS_FILE, newData);

    if (writeSuccess) {
      console.log(`🗑️ 学習項目削除: ID ${itemId}`);
      res.json({
        success: true,
        message: '学習項目を削除しました'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '学習項目の削除に失敗しました'
      });
    }
  } catch (error) {
    console.error('学習項目削除エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
});

// POST /study-items → 学習項目を追加
app.post('/study-items', async (req, res) => {
  const { name, category } = req.body;

  // バリデーション
  if (!name || !category) {
    return res.status(400).json({ 
      success: false,
      message: 'name と category を入力してください' 
    });
  }

  const newItem = {
    id: uuidv4(),
    name: name.trim(),
    category: category.trim(),
    createdAt: new Date().toISOString()
  };

  try {
    const data = await readJsonFile(STUDY_ITEMS_FILE);
    
    // 重複チェック
    const exists = data.some(item => 
      item.name.toLowerCase() === newItem.name.toLowerCase() &&
      item.category.toLowerCase() === newItem.category.toLowerCase()
    );
    
    if (exists) {
      return res.status(409).json({
        success: false,
        message: '同じ名前とカテゴリの学習項目が既に存在します'
      });
    }
    
    data.push(newItem);
    const writeSuccess = await writeJsonFile(STUDY_ITEMS_FILE, data);
    
    if (writeSuccess) {
      console.log(`➕ 学習項目追加: ${newItem.name} (${newItem.category})`);
      res.status(201).json({ success: true, data: newItem });
    } else {
      res.status(500).json({ 
        success: false,
        message: '学習項目の保存に失敗しました' 
      });
    }
  } catch (error) {
    console.error('学習項目追加エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// GET /study-items → 学習項目の一覧を取得
app.get('/study-items', async (req, res) => {
  try {
    const data = await readJsonFile(STUDY_ITEMS_FILE);
    // 作成日時順でソート（新しい順）
    const sortedData = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(sortedData);
  } catch (error) {
    console.error('学習項目取得エラー:', error);
    res.status(500).json({ 
      success: false,
      message: '学習項目の取得に失敗しました' 
    });
  }
});

// === 学習ログ 関連のAPI ===

// POST /logs → 学習ログを追加
app.post('/logs', async (req, res) => {
  const { studyItemId, date, content, duration, memo, tags } = req.body;

  // バリデーション
  if (!studyItemId || !date || !content || !duration) {
    return res.status(400).json({ 
      success: false,
      message: 'studyItemId, date, content, duration は必須です' 
    });
  }

  // 数値チェック
  const durationNum = parseInt(duration);
  if (isNaN(durationNum) || durationNum <= 0) {
    return res.status(400).json({
      success: false,
      message: '学習時間は正の数値で入力してください'
    });
  }

  // 日付チェック
  if (isNaN(Date.parse(date))) {
    return res.status(400).json({
      success: false,
      message: '正しい日付形式で入力してください'
    });
  }

  try {
    // 学習項目の存在確認
    const studyItems = await readJsonFile(STUDY_ITEMS_FILE);
    const studyItemExists = studyItems.some(item => item.id === studyItemId);
    
    if (!studyItemExists) {
      return res.status(404).json({
        success: false,
        message: '指定された学習項目が見つかりません'
      });
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
    const writeSuccess = await writeJsonFile(LOGS_FILE, data);
    
    if (writeSuccess) {
      const studyItem = studyItems.find(item => item.id === studyItemId);
      console.log(`📝 学習ログ追加: ${studyItem?.name || '不明'} - ${content} (${durationNum}分)`);
      res.status(201).json({ success: true, data: newLog });
    } else {
      res.status(500).json({ 
        success: false,
        message: '学習ログの保存に失敗しました' 
      });
    }
  } catch (error) {
    console.error('学習ログ追加エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// PUT /logs/:id → 学習ログを更新
app.put('/logs/:id', async (req, res) => {
  const logId = req.params.id;
  const { studyItemId, date, content, duration, memo, tags } = req.body;

  // バリデーション
  if (!studyItemId || !date || !content || !duration) {
    return res.status(400).json({ 
      success: false,
      message: 'studyItemId, date, content, duration は必須です' 
    });
  }

  // 数値チェック
  const durationNum = parseInt(duration);
  if (isNaN(durationNum) || durationNum <= 0) {
    return res.status(400).json({
      success: false,
      message: '学習時間は正の数値で入力してください'
    });
  }

  // 日付チェック
  if (isNaN(Date.parse(date))) {
    return res.status(400).json({
      success: false,
      message: '正しい日付形式で入力してください'
    });
  }

  try {
    // 学習項目の存在確認
    const studyItems = await readJsonFile(STUDY_ITEMS_FILE);
    const studyItemExists = studyItems.some(item => item.id === studyItemId);
    
    if (!studyItemExists) {
      return res.status(404).json({
        success: false,
        message: '指定された学習項目が見つかりません'
      });
    }

    let data = await readJsonFile(LOGS_FILE);
    const index = data.findIndex(log => log.id === logId);
    
    if (index === -1) {
      return res.status(404).json({ 
        success: false,
        message: '指定されたログが見つかりません' 
      });
    }

    // ログを更新（作成日時は保持）
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
    const writeSuccess = await writeJsonFile(LOGS_FILE, data);
    
    if (writeSuccess) {
      const studyItem = studyItems.find(item => item.id === studyItemId);
      console.log(`✏️ 学習ログ更新: ${studyItem?.name || '不明'} - ${content} (${durationNum}分)`);
      res.json({ success: true, data: updatedLog });
    } else {
      res.status(500).json({ 
        success: false,
        message: '学習ログの更新に失敗しました' 
      });
    }
  } catch (error) {
    console.error('学習ログ更新エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// GET /logs → 学習ログ一覧を取得（フィルター機能付き）
app.get('/logs', async (req, res) => {
  const { studyItemId, startDate, endDate, limit } = req.query;

  try {
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
    console.error('学習ログ取得エラー:', error);
    res.status(500).json({ 
      success: false,
      message: '学習ログの取得に失敗しました' 
    });
  }
});

// DELETE /logs/:id → 指定した学習ログを削除
app.delete('/logs/:id', async (req, res) => {
  const logId = req.params.id;
  
  try {
    let data = await readJsonFile(LOGS_FILE);
    const originalLength = data.length;
    const newData = data.filter(log => log.id !== logId);
    
    if (newData.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: '指定されたログが見つかりません'
      });
    }
    
    const writeSuccess = await writeJsonFile(LOGS_FILE, newData);
    
    if (writeSuccess) {
      console.log(`🗑️ 学習ログ削除: ID ${logId}`);
      res.json({ 
        success: true,
        message: 'ログを削除しました' 
      });
    } else {
      res.status(500).json({ 
        success: false,
        message: '学習ログの削除に失敗しました' 
      });
    }
  } catch (error) {
    console.error('学習ログ削除エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// === 統計情報API ===

// GET /stats → 学習統計を取得
app.get('/stats', async (req, res) => {
  try {
    const studyItems = await readJsonFile(STUDY_ITEMS_FILE);
    const logs = await readJsonFile(LOGS_FILE);
    
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

    // === 学習連続日数の計算 (Study Streak) ===
    let studyStreak = 0;
    if (logs.length > 0) {
      // ログを日付でソート（古い順）
      const sortedLogs = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));
      
      const uniqueStudyDates = new Set();
      sortedLogs.forEach(log => {
        // 日付部分のみを抽出 (YYYY-MM-DD)
        uniqueStudyDates.add(log.date.split('T')[0]);
      });

      const datesArray = Array.from(uniqueStudyDates).sort(); // 日付文字列をソート
      
      if (datesArray.length > 0) {
        let currentStreak = 0;
        let lastDate = null;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // 今日の日付の開始点

        // 今日または昨日が学習日に含まれているかチェック
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const todayStr = today.toISOString().split('T')[0];
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        let hasStudyTodayOrYesterday = false;
        if (uniqueStudyDates.has(todayStr)) {
          currentStreak = 1; // 今日学習があれば1日目
          hasStudyTodayOrYesterday = true;
          lastDate = today;
        } else if (uniqueStudyDates.has(yesterdayStr)) {
          currentStreak = 1; // 昨日学習があれば1日目
          hasStudyTodayOrYesterday = true;
          lastDate = yesterday;
        } else {
            // 今日も昨日も学習がなければ、現在の連続日数は0
            studyStreak = 0;
        }

        // 過去に遡って連続日数を計算
        if (hasStudyTodayOrYesterday) {
            for (let i = datesArray.length - 1; i >= 0; i--) {
                const logDate = new Date(datesArray[i]);
                logDate.setHours(0, 0, 0, 0);

                if (logDate.getTime() === lastDate.getTime()) {
                    // 同じ日付はスキップ (Setで既にユニーク化されているが念のため)
                    continue;
                }

                // 連続しているかチェック (1日前の日付かどうか)
                const prevDay = new Date(lastDate);
                prevDay.setDate(lastDate.getDate() - 1);

                if (logDate.getTime() === prevDay.getTime()) {
                    currentStreak++;
                    lastDate = logDate;
                } else if (logDate.getTime() < prevDay.getTime()) {
                    // 連続が途切れた
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
    console.error('統計取得エラー:', error);
    res.status(500).json({ 
      success: false,
      message: '統計情報の取得に失敗しました' 
    });
  }
});


// 404ハンドラー
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'エンドポイントが見つかりません',
    path: req.path
  });
});

// エラーハンドラー
app.use((error, req, res, next) => {
  console.error('サーバーエラー:', error);
  res.status(500).json({
    success: false,
    message: 'サーバー内部エラーが発生しました'
  });
});

// サーバー起動
async function startServer() {
  await initializeData();
  
  app.listen(PORT, () => {
    console.log('');
    console.log('🚀 ====================================');
    console.log(`📚 学習記録アプリサーバーが起動しました`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📊 API Info: http://localhost:${PORT}/api-info`); // API情報のエンドポイント名を変更
    console.log('🚀 ====================================');
    console.log('');
  });
}

// プロセス終了時の処理
process.on('SIGINT', () => {
  console.log('\n👋 サーバーを停止します...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 サーバーを停止します...');
  process.exit(0);
});

// サーバー起動
startServer().catch(error => {
  console.error('❌ サーバー起動エラー:', error);
  process.exit(1);
});
