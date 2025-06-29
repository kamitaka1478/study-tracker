const express = require('express');
const path = require('path'); //pathモジュールをインポート
const app = express();
const PORT = process.env.PORT || 3000;

// 環境変数の読み込み
require('dotenv').config();

// 必要なモジュールのインポート
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// デバッグ用: 静的ファイルのリクエストをログ出力
app.use((req, res, next) => {
    if (req.url.endsWith('.js') || req.url.endsWith('.html')) {
        console.log('Static file request:', req.url);
    }
    next();
});

// ★★★ ここから追加・修正する部分 ★★★
// 静的ファイルを提供する設定
// 'public' フォルダがある場合（推奨される構成）
// app.use(express.static(path.join(__dirname, 'public')));

// もしHTMLファイルが直接プロジェクトルートにある場合 (現在の状況に合わせる)
// あなたの study-tracker ディレクトリの直下に dashboard.html や auth.js があるなら、
// 以下のように設定します。
app.use(express.static(path.join(__dirname))); 
// または、特定のフォルダにフロントエンドファイルを置いている場合は
// app.use(express.static(path.join(__dirname, 'frontend_folder_name')));
// ★★★ ここまで ★★★

// ユーティリティのインポートは不要になります (readJsonFile/writeJsonFileを使わないため)
// const { initializeDataDirectory } = require('./src/utils/fileUtils');

// ルートのインポートはそのままですが、内部の実装をDB連携に変更します
// const studyItemsRoutes = require('./src/routes/studyItems'); // これらは直接server.jsに統合するか、DB対応版を作成
// const logsRoutes = require('./src/routes/logs'); // これらは直接server.jsに統合するか、DB対応版を作成
// const statsRoutes = require('./src/routes/stats'); // これらは直接server.jsに統合するか、DB対応版を作成

// ミドルウェアのインポート
const errorHandler = require('./src/middleware/errorHandler');

const NODE_ENV = process.env.NODE_ENV || 'development';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET;

// ミドルウェア設定
app.use(express.json());
app.use(express.static('public'));

// CORS設定（開発環境用）
if (NODE_ENV === 'development') {
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization'); // Authorization ヘッダーを許可
        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
        } else {
            next();
        }
    });
}

// ルートパス
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// API情報エンドポイント
app.get('/api-info', (req, res) => {
    res.json({
        message: '📚 学習記録アプリAPI',
        status: 'running',
        environment: NODE_ENV,
        endpoints: {
            'POST /auth/register': 'ユーザー登録',
            'POST /auth/login': 'ログイン',
            'GET /auth/me': 'ログイン中ユーザー情報取得 (要認証)',
            'GET /study-items': '学習項目一覧取得 (要認証)',
            'POST /study-items': '学習項目追加 (要認証)',
            'PUT /study-items/:id': '学習項目更新 (要認証)',
            'DELETE /study-items/:id': '学習項目削除 (要認証)',
            'GET /logs': '学習ログ一覧取得 (要認証)',
            'POST /logs': '学習ログ追加 (要認証)',
            'PUT /logs/:id': '学習ログ更新 (要認証)',
            'DELETE /logs/:id': '学習ログ削除 (要認証)',
            'GET /stats': '学習統計取得 (要認証)'
        }
    });
});

// --- ユーザー認証 関連のAPI ---

// ユーザー登録
app.post('/auth/register', async (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
        return res.status(400).json({ message: 'メールアドレス、ユーザー名、パスワードは全て必須です' });
    }
    try {
        // メール重複チェック
        const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
        if (exists.rowCount > 0) {
            return res.status(409).json({ message: 'このメールアドレスは既に登録されています' });
        }
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
            [email, username, hash]
        );
        res.status(201).json({ user: result.rows[0] });
    } catch (err) {
        console.error('ユーザー登録エラー:', err);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// ログイン
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'メールアドレスとパスワードは必須です' });
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rowCount === 0) return res.status(401).json({ message: '認証失敗：メールアドレスまたはパスワードが間違っています' });
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ message: '認証失敗：メールアドレスまたはパスワードが間違っています' });
        // JWT発行
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, email: user.email, username: user.username } });
    } catch (err) {
        console.error('ログインエラー:', err);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// 認証ミドルウェア
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: '認証が必要です。トークンが提供されていません。' });
    try {
        const token = auth.split(' ')[1];
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload; // req.user.userId にユーザーIDが格納される
        next();
    } catch (err) {
        console.error('認証ミドルウェアエラー:', err);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'トークンの有効期限が切れています' });
        }
        res.status(401).json({ message: 'トークンが無効です' });
    }
}

// ログイン中ユーザー情報取得
app.get('/auth/me', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, username, created_at FROM users WHERE id = $1', [req.user.userId]);
        if (result.rowCount === 0) return res.status(404).json({ message: 'ユーザーが見つかりません' });
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error('ユーザー情報取得エラー:', err);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});


// --- 学習項目 関連のAPI ---

// POST /study-items → 学習項目を追加 (認証が必要)
app.post('/study-items', authMiddleware, async (req, res) => {
    const { name, category } = req.body;
    const userId = req.user.userId;

    // バリデーション
    if (!name || !category) {
        return res.status(400).json({
            success: false,
            message: 'name と category は必須です'
        });
    }

    try {
        // 重複チェック (同じユーザー内で重複を許可しない)
        const exists = await pool.query(
            'SELECT 1 FROM study_items WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND LOWER(category) = LOWER($3)',
            [userId, name.trim(), category.trim()]
        );

        if (exists.rowCount > 0) {
            return res.status(409).json({
                success: false,
                message: '同じ名前とカテゴリの学習項目が既に存在します'
            });
        }

        const result = await pool.query(
            'INSERT INTO study_items (user_id, name, category) VALUES ($1, $2, $3) RETURNING *',
            [userId, name.trim(), category.trim()]
        );
        const newItem = result.rows[0];
        console.log(`➕ 学習項目追加: ${newItem.name} (${newItem.category}) by User ID: ${userId}`);
        res.status(201).json({ success: true, data: newItem });

    } catch (error) {
        console.error('学習項目追加エラー:', error);
        res.status(500).json({
            success: false,
            message: 'サーバーエラーが発生しました'
        });
    }
});

// GET /study-items → 学習項目の一覧を取得 (認証が必要)
app.get('/study-items', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const result = await pool.query(
            'SELECT * FROM study_items WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('学習項目取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '学習項目の取得に失敗しました'
        });
    }
});

// PUT /study-items/:id → 学習項目を更新 (認証が必要)
app.put('/study-items/:id', authMiddleware, async (req, res) => {
    const itemId = req.params.id;
    const { name, category } = req.body;
    const userId = req.user.userId;

    // バリデーション
    if (!name || !category) {
        return res.status(400).json({
            success: false,
            message: 'name と category は必須です'
        });
    }

    try {
        // 対象の学習項目が現在のユーザーに属しているか確認
        const checkOwnership = await pool.query(
            'SELECT 1 FROM study_items WHERE id = $1 AND user_id = $2',
            [itemId, userId]
        );
        if (checkOwnership.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された学習項目が見つからないか、アクセス権がありません'
            });
        }

        // 重複チェック (自分自身を除く)
        const exists = await pool.query(
            'SELECT 1 FROM study_items WHERE user_id = $1 AND id != $2 AND LOWER(name) = LOWER($3) AND LOWER(category) = LOWER($4)',
            [userId, itemId, name.trim(), category.trim()]
        );
        if (exists.rowCount > 0) {
            return res.status(409).json({
                success: false,
                message: '同じ名前とカテゴリの学習項目が既に存在します'
            });
        }

        const result = await pool.query(
            'UPDATE study_items SET name = $1, category = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
            [name.trim(), category.trim(), itemId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された学習項目が見つかりません'
            });
        }

        const updatedItem = result.rows[0];
        console.log(`✏️ 学習項目更新: ID ${itemId} - ${updatedItem.name} (${updatedItem.category}) by User ID: ${userId}`);
        res.json({ success: true, data: updatedItem });

    } catch (error) {
        console.error('学習項目更新エラー:', error);
        res.status(500).json({
            success: false,
            message: 'サーバーエラーが発生しました'
        });
    }
});

// DELETE /study-items/:id → 指定した学習項目を削除 (認証が必要)
app.delete('/study-items/:id', authMiddleware, async (req, res) => {
    const itemId = req.params.id;
    const userId = req.user.userId;

    try {
        const result = await pool.query(
            'DELETE FROM study_items WHERE id = $1 AND user_id = $2 RETURNING id',
            [itemId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された学習項目が見つからないか、アクセス権がありません'
            });
        }

        console.log(`🗑️ 学習項目削除: ID ${itemId} by User ID: ${userId}`);
        res.json({
            success: true,
            message: '学習項目を削除しました'
        });
    } catch (error) {
        console.error('学習項目削除エラー:', error);
        res.status(500).json({
            success: false,
            message: 'サーバーエラーが発生しました'
        });
    }
});


// --- 学習ログ 関連のAPI ---

// POST /logs → 学習ログを追加 (認証が必要)
app.post('/logs', authMiddleware, async (req, res) => {
    const { studyItemId, date, content, duration, memo, tags } = req.body;
    const userId = req.user.userId;

    // バリデーション
    if (!studyItemId || !date || !content || !duration) {
        return res.status(400).json({
            success: false,
            message: 'studyItemId, date, content, duration は必須です'
        });
    }

    const durationNum = parseInt(duration);
    if (isNaN(durationNum) || durationNum <= 0) {
        return res.status(400).json({
            success: false,
            message: '学習時間は正の数値で入力してください'
        });
    }

    if (isNaN(Date.parse(date))) {
        return res.status(400).json({
            success: false,
            message: '正しい日付形式で入力してください (YYYY-MM-DD)'
        });
    }

    try {
        // 学習項目の存在確認とユーザー所有権の確認
        const studyItemCheck = await pool.query(
            'SELECT name FROM study_items WHERE id = $1 AND user_id = $2',
            [studyItemId, userId]
        );

        if (studyItemCheck.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された学習項目が見つからないか、アクセス権がありません'
            });
        }

        const studyItemName = studyItemCheck.rows[0].name;

        const result = await pool.query(
            'INSERT INTO logs (user_id, study_item_id, date, content, duration, memo, tags) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [
                userId,
                studyItemId,
                date, // PostgreSQLのDATE型はISO 8601形式の文字列を直接受け入れます
                content.trim(),
                durationNum,
                memo ? memo.trim() : null, // 空文字列ではなくnullを保存
                Array.isArray(tags) ? tags.map(t => t.trim()).filter(t => t) : [] // 空の配列の場合もOK
            ]
        );
        const newLog = result.rows[0];
        console.log(`📝 学習ログ追加: ${studyItemName} - ${content} (${durationNum}分) by User ID: ${userId}`);
        res.status(201).json({ success: true, data: newLog });

    } catch (error) {
        console.error('学習ログ追加エラー:', error);
        res.status(500).json({
            success: false,
            message: 'サーバーエラーが発生しました'
        });
    }
});

// PUT /logs/:id → 学習ログを更新 (認証が必要)
app.put('/logs/:id', authMiddleware, async (req, res) => {
    const logId = req.params.id;
    const { studyItemId, date, content, duration, memo, tags } = req.body;
    const userId = req.user.userId;

    // バリデーション
    if (!studyItemId || !date || !content || !duration) {
        return res.status(400).json({
            success: false,
            message: 'studyItemId, date, content, duration は必須です'
        });
    }

    const durationNum = parseInt(duration);
    if (isNaN(durationNum) || durationNum <= 0) {
        return res.status(400).json({
            success: false,
            message: '学習時間は正の数値で入力してください'
        });
    }

    if (isNaN(Date.parse(date))) {
        return res.status(400).json({
            success: false,
            message: '正しい日付形式で入力してください (YYYY-MM-DD)'
        });
    }

    try {
        // 対象のログが現在のユーザーに属しているか確認
        const checkLogOwnership = await pool.query(
            'SELECT 1 FROM logs WHERE id = $1 AND user_id = $2',
            [logId, userId]
        );
        if (checkLogOwnership.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたログが見つからないか、アクセス権がありません'
            });
        }

        // 更新後のstudyItemIdがユーザーのものであるか確認
        const studyItemCheck = await pool.query(
            'SELECT name FROM study_items WHERE id = $1 AND user_id = $2',
            [studyItemId, userId]
        );
        if (studyItemCheck.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された学習項目が見つからないか、アクセス権がありません'
            });
        }
        const studyItemName = studyItemCheck.rows[0].name;

        const result = await pool.query(
            'UPDATE logs SET study_item_id = $1, date = $2, content = $3, duration = $4, memo = $5, tags = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 AND user_id = $8 RETURNING *',
            [
                studyItemId,
                date,
                content.trim(),
                durationNum,
                memo ? memo.trim() : null,
                Array.isArray(tags) ? tags.map(t => t.trim()).filter(t => t) : [],
                logId,
                userId
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたログが見つかりません'
            });
        }

        const updatedLog = result.rows[0];
        console.log(`✏️ 学習ログ更新: ${studyItemName} - ${content} (${durationNum}分) (Log ID: ${logId}) by User ID: ${userId}`);
        res.json({ success: true, data: updatedLog });

    } catch (error) {
        console.error('学習ログ更新エラー:', error);
        res.status(500).json({
            success: false,
            message: 'サーバーエラーが発生しました'
        });
    }
});

// GET /logs → 学習ログ一覧を取得（フィルター機能付き） (認証が必要)
app.get('/logs', authMiddleware, async (req, res) => {
    const { studyItemId, startDate, endDate, limit } = req.query;
    const userId = req.user.userId;

    let query = 'SELECT * FROM logs WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (studyItemId) {
        query += ` AND study_item_id = $${paramIndex++}`;
        params.push(studyItemId);
    }
    if (startDate) {
        query += ` AND date >= $${paramIndex++}`;
        params.push(startDate);
    }
    if (endDate) {
        query += ` AND date <= $${paramIndex++}`;
        params.push(endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC'; // 日付の降順、同じ日付の場合は作成日時の降順

    if (limit) {
        const limitNum = parseInt(limit);
        if (!isNaN(limitNum) && limitNum > 0) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(limitNum);
        }
    }

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('学習ログ取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '学習ログの取得に失敗しました'
        });
    }
});

// DELETE /logs/:id → 指定した学習ログを削除 (認証が必要)
app.delete('/logs/:id', authMiddleware, async (req, res) => {
    const logId = req.params.id;
    const userId = req.user.userId;

    try {
        const result = await pool.query(
            'DELETE FROM logs WHERE id = $1 AND user_id = $2 RETURNING id',
            [logId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたログが見つからないか、アクセス権がありません'
            });
        }

        console.log(`🗑️ 学習ログ削除: ID ${logId} by User ID: ${userId}`);
        res.json({
            success: true,
            message: 'ログを削除しました'
        });
    } catch (error) {
        console.error('学習ログ削除エラー:', error);
        res.status(500).json({
            success: false,
            message: 'サーバーエラーが発生しました'
        });
    }
});


// --- 統計情報API ---

// GET /stats → 学習統計を取得 (認証が必要)
app.get('/stats', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const studyItemsResult = await pool.query(
            'SELECT id, name, category FROM study_items WHERE user_id = $1',
            [userId]
        );
        const studyItems = studyItemsResult.rows;

        const logsResult = await pool.query(
            'SELECT study_item_id, date, duration FROM logs WHERE user_id = $1 ORDER BY date ASC, created_at ASC',
            [userId]
        );
        const logs = logsResult.rows;

        const totalTime = logs.reduce((sum, log) => sum + (log.duration || 0), 0);
        const totalHours = Math.round(totalTime / 60 * 100) / 100;

        // カテゴリ別統計
        const categoryStats = {};
        studyItems.forEach(item => {
            const itemLogs = logs.filter(log => log.study_item_id === item.id);
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
            const uniqueStudyDates = new Set();
            logs.forEach(log => {
                uniqueStudyDates.add(log.date.toISOString().split('T')[0]); // DateオブジェクトをYYYY-MM-DD形式に
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

// エラーハンドリング（最後に配置）
app.use(errorHandler);

// サーバー起動
async function startServer() {
    try {
        // initializeDataDirectory は不要になります

        // DB接続テスト
        await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQLに正常に接続しました。');

        app.listen(PORT, () => {
            console.log('');
            console.log('🚀 ====================================');
            console.log(`📚 学習記録アプリサーバーが起動しました`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`🔧 環境: ${NODE_ENV}`);
            console.log(`📊 API Info: http://localhost:${PORT}/api-info`);
            console.log('🚀 ====================================');
            console.log('');
        });
    } catch (error) {
        console.error('❌ サーバー起動エラー: PostgreSQLへの接続、またはテーブル作成に失敗しました。', error);
        process.exit(1);
    }
}

// プロセス終了時の処理
process.on('SIGINT', () => {
    console.log('\n👋 サーバーを停止します...');
    pool.end(() => { // アプリケーション終了時にプールを閉じる
        console.log('PostgreSQL接続プールを閉じました。');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n👋 サーバーを停止します...');
    pool.end(() => { // アプリケーション終了時にプールを閉じる
        console.log('PostgreSQL接続プールを閉じました。');
        process.exit(0);
    });
});

// サーバー起動
startServer();