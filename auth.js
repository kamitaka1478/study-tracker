// auth.js - 認証関連のヘルパー関数

/**
 * 認証ヘッダーを取得する関数
 * JWTトークンがある場合はAuthorizationヘッダーに含める
 */
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    if (token) {
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }
    return { 'Content-Type': 'application/json' };
}

/**
 * ログアウト処理
 */
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'index.html'; // またはログインページのファイル名
}

/**
 * トークンの有効性をチェック
 */
function isAuthenticated() {
    const token = localStorage.getItem('token');
    return !!token; // トークンが存在すればtrue、なければfalse
}

/**
 * 認証が必要なページで使用する認証チェック
 * トークンがない場合はログインページにリダイレクト
 */
function requireAuth() {
    if (!isAuthenticated()) {
        console.log('認証が必要です。ログインページにリダイレクトします。');
        window.location.href = 'index.html'; // またはログインページのファイル名
        return false;
    }
    return true;
}

/**
 * APIエラーハンドリング
 * 401エラーの場合は自動的にログアウト
 */
function handleApiError(error, response) {
    if (response && response.status === 401) {
        console.log('認証エラー: トークンが無効です。ログアウトします。');
        logout();
        return;
    }
    console.error('API Error:', error);
}

// デバッグ用: 現在のトークン状態を確認
function debugAuth() {
    const token = localStorage.getItem('token');
    console.log('Current token:', token ? 'exists' : 'not found');
    console.log('Is authenticated:', isAuthenticated());
}