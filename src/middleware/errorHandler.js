// src/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  // 開発環境では詳細なエラー情報を表示
  if (process.env.NODE_ENV === 'development') {
    console.error('Error Stack:', err.stack);
  } else {
    console.error('Error:', err.message);
  }

  // ステータスコードの設定
  const statusCode = err.statusCode || 500;
  const message = err.message || 'サーバーエラーが発生しました';

  // クライアントへのレスポンス
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { 
      error: err.stack 
    })
  });
};

module.exports = errorHandler;
