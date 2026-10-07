from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv('DATA_DIR', ROOT / 'data'))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.getenv('DB_PATH', DATA_DIR / 'ledger.sqlite3'))
TOKEN_SECRET = os.getenv('TOKEN_SECRET', 'replace-this-secret-before-public-deploy')
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys = ON')
    return connection


def init_db() -> None:
    with db() as connection:
        connection.executescript(
            '''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                owner_id TEXT NOT NULL REFERENCES users(id),
                invite_code TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS book_members (
                book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                joined_at TEXT NOT NULL,
                PRIMARY KEY (book_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
                title TEXT NOT NULL,
                category_id TEXT NOT NULL,
                category_label TEXT NOT NULL,
                note TEXT,
                spent_at TEXT NOT NULL,
                payer_id TEXT NOT NULL REFERENCES users(id),
                participants_json TEXT NOT NULL,
                created_by TEXT NOT NULL REFERENCES users(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settlements (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                from_id TEXT NOT NULL REFERENCES users(id),
                to_id TEXT NOT NULL REFERENCES users(id),
                amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
                note TEXT,
                settled_at TEXT NOT NULL,
                created_by TEXT NOT NULL REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS expenses_book_date_idx ON expenses(book_id, spent_at);
            CREATE INDEX IF NOT EXISTS members_user_idx ON book_members(user_id);
            '''
        )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 210_000)
    return f'pbkdf2_sha256${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt_string, digest_string = encoded.split('$')
        if algorithm != 'pbkdf2_sha256':
            return False
        salt = base64.urlsafe_b64decode(salt_string.encode())
        expected = base64.urlsafe_b64decode(digest_string.encode())
        actual = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 210_000)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def encode_token(user_id: str) -> str:
    payload = {'sub': user_id, 'exp': int(time.time()) + TOKEN_TTL_SECONDS}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode()).decode().rstrip('=')
    signature = hmac.new(TOKEN_SECRET.encode(), body.encode(), hashlib.sha256).digest()
    return f'{body}.{base64.urlsafe_b64encode(signature).decode().rstrip("=")}'


def decode_token(token: str) -> str:
    try:
        body, encoded_signature = token.split('.', 1)
        signature = base64.urlsafe_b64decode(encoded_signature + '=' * (-len(encoded_signature) % 4))
        expected = hmac.new(TOKEN_SECRET.encode(), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError('invalid signature')
        payload = json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)).decode())
        if int(payload['exp']) < int(time.time()):
            raise ValueError('expired')
        return str(payload['sub'])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='登录已过期，请重新登录')


bearer = HTTPBearer(auto_error=False)


def current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> sqlite3.Row:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='请先登录')
    user_id = decode_token(credentials.credentials)
    with db() as connection:
        user = connection.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='用户不存在')
    return user


def require_book_member(book_id: str, user_id: str) -> sqlite3.Row:
    with db() as connection:
        book = connection.execute(
            '''SELECT b.* FROM books b JOIN book_members m ON m.book_id = b.id
               WHERE b.id = ? AND m.user_id = ?''',
            (book_id, user_id),
        ).fetchone()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='账本不存在或你没有权限')
    return book


class AuthPayload(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = Field(default=None, max_length=30)

    @field_validator('email')
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if '@' not in normalized or '.' not in normalized.split('@')[-1]:
            raise ValueError('请输入有效邮箱')
        return normalized


class BookPayload(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class JoinPayload(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class ExpensePayload(BaseModel):
    amount_fen: int = Field(gt=0, le=100_000_000)
    title: str = Field(min_length=1, max_length=80)
    category_id: str = Field(min_length=1, max_length=40)
    category_label: str = Field(min_length=1, max_length=40)
    note: Optional[str] = Field(default=None, max_length=300)
    spent_at: str
    payer_id: str
    participants: List[str] = Field(min_length=1, max_length=2)


class SettlementPayload(BaseModel):
    from_id: str
    to_id: str
    amount_fen: int = Field(gt=0, le=100_000_000)
    note: Optional[str] = Field(default=None, max_length=300)
    settled_at: Optional[str] = None


app = FastAPI(title='一起记账 API', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.on_event('startup')
def on_startup() -> None:
    init_db()


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


def user_response(user: sqlite3.Row, token: str) -> dict[str, Any]:
    return {
        'token': token,
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name']},
    }


@app.post('/auth/register')
def register(payload: AuthPayload) -> dict[str, Any]:
    user_id = str(uuid.uuid4())
    name = payload.name or payload.email.split('@')[0]
    try:
        with db() as connection:
            connection.execute(
                'INSERT INTO users(id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)',
                (user_id, payload.email, hash_password(payload.password), name, now_iso()),
            )
            user = connection.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='这个邮箱已经注册')
    return user_response(user, encode_token(user_id))


@app.post('/auth/login')
def login(payload: AuthPayload) -> dict[str, Any]:
    with db() as connection:
        user = connection.execute('SELECT * FROM users WHERE email = ?', (payload.email,)).fetchone()
    if not user or not verify_password(payload.password, user['password_hash']):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='邮箱或密码不正确')
    return user_response(user, encode_token(user['id']))


@app.get('/me')
def me(user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return {'id': user['id'], 'email': user['email'], 'name': user['name']}


def book_response(book: sqlite3.Row, connection: sqlite3.Connection) -> dict[str, Any]:
    members_rows = connection.execute(
        '''SELECT u.id, u.email, u.name FROM users u
           JOIN book_members m ON m.user_id = u.id WHERE m.book_id = ? ORDER BY m.joined_at''',
        (book['id'],),
    ).fetchall()
    return {
        'id': book['id'],
        'name': book['name'],
        'owner_id': book['owner_id'],
        'invite_code': book['invite_code'],
        'members': [dict(row) for row in members_rows],
        'created_at': book['created_at'],
    }


def new_invite_code(connection: sqlite3.Connection) -> str:
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    while True:
        code = ''.join(secrets.choice(alphabet) for _ in range(6))
        if not connection.execute('SELECT 1 FROM books WHERE invite_code = ?', (code,)).fetchone():
            return code


@app.get('/books')
def list_books(user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    with db() as connection:
        books = connection.execute(
            '''SELECT b.* FROM books b JOIN book_members m ON m.book_id = b.id
               WHERE m.user_id = ? ORDER BY b.created_at''',
            (user['id'],),
        ).fetchall()
        return [book_response(book, connection) for book in books]


@app.post('/books')
def create_book(payload: BookPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    book_id = str(uuid.uuid4())
    with db() as connection:
        code = new_invite_code(connection)
        timestamp = now_iso()
        connection.execute(
            'INSERT INTO books(id, name, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
            (book_id, payload.name.strip(), user['id'], code, timestamp),
        )
        connection.execute(
            'INSERT INTO book_members(book_id, user_id, joined_at) VALUES (?, ?, ?)',
            (book_id, user['id'], timestamp),
        )
        book = connection.execute('SELECT * FROM books WHERE id = ?', (book_id,)).fetchone()
        return book_response(book, connection)


@app.post('/books/join')
def join_book(payload: JoinPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    with db() as connection:
        book = connection.execute('SELECT * FROM books WHERE invite_code = ?', (payload.code.upper(),)).fetchone()
        if not book:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='邀请码不存在')
        count = connection.execute('SELECT COUNT(*) AS count FROM book_members WHERE book_id = ?', (book['id'],)).fetchone()['count']
        if count >= 2 and not connection.execute(
            'SELECT 1 FROM book_members WHERE book_id = ? AND user_id = ?', (book['id'], user['id'])
        ).fetchone():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='这个账本已经有两位成员')
        connection.execute(
            'INSERT OR IGNORE INTO book_members(book_id, user_id, joined_at) VALUES (?, ?, ?)',
            (book['id'], user['id'], now_iso()),
        )
        return book_response(book, connection)


@app.get('/books/{book_id}')
def get_book(book_id: str, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    require_book_member(book_id, user['id'])
    with db() as connection:
        book = connection.execute('SELECT * FROM books WHERE id = ?', (book_id,)).fetchone()
        return book_response(book, connection)


def expense_response(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    result['participants'] = json.loads(result.pop('participants_json'))
    return result


@app.get('/books/{book_id}/expenses')
def list_expenses(book_id: str, user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    require_book_member(book_id, user['id'])
    with db() as connection:
        rows = connection.execute(
            'SELECT * FROM expenses WHERE book_id = ? ORDER BY spent_at DESC, created_at DESC',
            (book_id,),
        ).fetchall()
    return [expense_response(row) for row in rows]


@app.post('/books/{book_id}/expenses')
def create_expense(book_id: str, payload: ExpensePayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    require_book_member(book_id, user['id'])
    participants = list(dict.fromkeys(payload.participants))
    with db() as connection:
        members_rows = connection.execute('SELECT user_id FROM book_members WHERE book_id = ?', (book_id,)).fetchall()
        member_ids = {row['user_id'] for row in members_rows}
        if payload.payer_id not in member_ids or any(member not in member_ids for member in participants):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='支出成员不属于当前账本')
        expense_id = str(uuid.uuid4())
        timestamp = now_iso()
        connection.execute(
            '''INSERT INTO expenses(
                id, book_id, amount_fen, title, category_id, category_label, note,
                spent_at, payer_id, participants_json, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                expense_id, book_id, payload.amount_fen, payload.title.strip(), payload.category_id,
                payload.category_label, payload.note, payload.spent_at, payload.payer_id,
                json.dumps(participants), user['id'], timestamp, timestamp,
            ),
        )
        row = connection.execute('SELECT * FROM expenses WHERE id = ?', (expense_id,)).fetchone()
    return expense_response(row)


@app.put('/books/{book_id}/expenses/{expense_id}')
def update_expense(book_id: str, expense_id: str, payload: ExpensePayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    require_book_member(book_id, user['id'])
    participants = list(dict.fromkeys(payload.participants))
    with db() as connection:
        members_rows = connection.execute('SELECT user_id FROM book_members WHERE book_id = ?', (book_id,)).fetchall()
        member_ids = {row['user_id'] for row in members_rows}
        if payload.payer_id not in member_ids or any(member not in member_ids for member in participants):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='支出成员不属于当前账本')
        timestamp = now_iso()
        cursor = connection.execute(
            '''UPDATE expenses SET
                amount_fen = ?, title = ?, category_id = ?, category_label = ?, note = ?,
                spent_at = ?, payer_id = ?, participants_json = ?, updated_at = ?
               WHERE id = ? AND book_id = ?''',
            (
                payload.amount_fen, payload.title.strip(), payload.category_id, payload.category_label,
                payload.note, payload.spent_at, payload.payer_id, json.dumps(participants), timestamp,
                expense_id, book_id,
            ),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='支出不存在')
        row = connection.execute('SELECT * FROM expenses WHERE id = ?', (expense_id,)).fetchone()
    return expense_response(row)


@app.delete('/books/{book_id}/expenses/{expense_id}')
def delete_expense(book_id: str, expense_id: str, user: sqlite3.Row = Depends(current_user)) -> dict[str, bool]:
    require_book_member(book_id, user['id'])
    with db() as connection:
        cursor = connection.execute('DELETE FROM expenses WHERE id = ? AND book_id = ?', (expense_id, book_id))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='支出不存在')
    return {'deleted': True}


@app.get('/books/{book_id}/settlements')
def list_settlements(book_id: str, user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    require_book_member(book_id, user['id'])
    with db() as connection:
        rows = connection.execute('SELECT * FROM settlements WHERE book_id = ? ORDER BY settled_at DESC', (book_id,)).fetchall()
    return [dict(row) for row in rows]


@app.post('/books/{book_id}/settlements')
def create_settlement(book_id: str, payload: SettlementPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    require_book_member(book_id, user['id'])
    if payload.from_id == payload.to_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='结算双方不能是同一个人')
    settlement_id = str(uuid.uuid4())
    with db() as connection:
        members_rows = connection.execute('SELECT user_id FROM book_members WHERE book_id = ?', (book_id,)).fetchall()
        member_ids = {row['user_id'] for row in members_rows}
        if payload.from_id not in member_ids or payload.to_id not in member_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='结算成员不属于当前账本')
        connection.execute(
            '''INSERT INTO settlements(id, book_id, from_id, to_id, amount_fen, note, settled_at, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (settlement_id, book_id, payload.from_id, payload.to_id, payload.amount_fen, payload.note, payload.settled_at or now_iso(), user['id']),
        )
        row = connection.execute('SELECT * FROM settlements WHERE id = ?', (settlement_id,)).fetchone()
    return dict(row)


@app.get('/books/{book_id}/balance')
def balance(book_id: str, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    require_book_member(book_id, user['id'])
    with db() as connection:
        members_rows = connection.execute(
            '''SELECT u.id, u.name FROM users u JOIN book_members m ON m.user_id = u.id
               WHERE m.book_id = ? ORDER BY m.joined_at''', (book_id,)
        ).fetchall()
        paid = {row['id']: 0 for row in members_rows}
        owed = {row['id']: 0 for row in members_rows}
        expense_rows = connection.execute('SELECT amount_fen, payer_id, participants_json FROM expenses WHERE book_id = ?', (book_id,)).fetchall()
        for row in expense_rows:
            paid[row['payer_id']] += row['amount_fen']
            participants = json.loads(row['participants_json'])
            share, remainder = divmod(row['amount_fen'], len(participants))
            for index, participant in enumerate(participants):
                owed[participant] += share + (remainder if index == 0 else 0)
        settlement_rows = connection.execute('SELECT from_id, to_id, amount_fen FROM settlements WHERE book_id = ?', (book_id,)).fetchall()
        for row in settlement_rows:
            paid[row['from_id']] += row['amount_fen']
            paid[row['to_id']] -= row['amount_fen']
        entries = [{'id': row['id'], 'name': row['name'], 'paid_fen': paid[row['id']], 'owed_fen': owed[row['id']], 'net_fen': paid[row['id']] - owed[row['id']]} for row in members_rows]
    return {'members': entries}


@app.middleware('http')
async def add_version_header(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-App-Version'] = '0.1.0'
    return response
