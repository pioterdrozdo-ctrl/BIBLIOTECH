const API_URL = window.BIBLIOTECH_API_URL || '/api';

let currentToken = localStorage.getItem('token');

function getHeaders() {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
    }
    return headers;
}

async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: getHeaders(),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API request failed');
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Auth API
async function register(username, password, email) {
    const data = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, email }),
    });
    if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        currentToken = data.token;
    }
    return data;
}

async function login(username, password) {
    const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });
    if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        currentToken = data.token;
    }
    return data;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentToken = null;
}

// Books API
async function getBooks(filters = {}) {
    const params = new URLSearchParams(filters);
    return await apiRequest(`/books?${params.toString()}`);
}

async function getBook(id) {
    return await apiRequest(`/books/${id}`);
}

async function addBook(bookData) {
    return await apiRequest('/books', {
        method: 'POST',
        body: JSON.stringify(bookData),
    });
}

async function updateBook(id, bookData) {
    return await apiRequest(`/books/${id}`, {
        method: 'PUT',
        body: JSON.stringify(bookData),
    });
}

async function deleteBook(id) {
    return await apiRequest(`/books/${id}`, {
        method: 'DELETE',
    });
}

// Comments API
async function addComment(bookId, text) {
    return await apiRequest('/comments', {
        method: 'POST',
        body: JSON.stringify({ bookId, text }),
    });
}

async function deleteComment(id) {
    return await apiRequest(`/comments/${id}`, {
        method: 'DELETE',
    });
}

// Stats API
async function getStats() {
    return await apiRequest('/stats');
}

// Export
window.api = {
    register,
    login,
    logout,
    getBooks,
    getBook,
    addBook,
    updateBook,
    deleteBook,
    addComment,
    deleteComment,
    getStats,
};
