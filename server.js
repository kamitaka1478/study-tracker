// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');

// ユーティリティのインポート
const { initializeDataDirectory } = require('./src/utils/fileUtils');

// ルートのインポート
const studyItemsRoutes = require('./src/routes/studyItems');
const logsRoutes = require('./src/routes/logs');
const statsRoutes = require('./src/routes/stats');

// ミドルウェアのインポート
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ミドルウェア設定
app.use(express.json());
app.use(express.static('public'));

// CORS設定（開発環境用）
if (NODE_ENV === 'development') {
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
}

// ルート設定
app.use('/study-items', studyItemsRoutes);
app.use('/logs', logsRoutes);
app.use('/stats', statsRoutes);

// ルートパス
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API情報エンドポイント
app.get('/api-info', (req, res) => {
  res.json({
    message: '📚 学習記録アプリAPI',
    status: 'running',
    environment: NODE_ENV,
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
    await initializeDataDirectory();
    
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
    console.error('❌ サーバー起動エラー:', error);
    process.exit(1);
  }
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
startServer();
