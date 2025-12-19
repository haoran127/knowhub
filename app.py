"""
KnowHub - 技术笔记与经验分享
支持 Markdown 文档的树形目录管理、上传、全文搜索和 AI 对话
"""

import os
import re
import json
import shutil
import hashlib
import secrets
import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Optional, List
from datetime import datetime, timedelta
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, Cookie, Response, Depends, Request, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import markdown
import uvicorn
import httpx

# ============================================================
# 配置
# ============================================================
BASE_DIR = Path(__file__).parent
DOCS_DIR = BASE_DIR / "docs"
DATA_FILE = BASE_DIR / "data" / "tree.json"
COMMENTS_FILE = BASE_DIR / "data" / "comments.json"
SESSIONS_FILE = BASE_DIR / "data" / "sessions.json"
VIEWS_FILE = BASE_DIR / "data" / "views.json"
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
IMAGES_DIR = BASE_DIR / "images"

# 确保目录存在
DOCS_DIR.mkdir(exist_ok=True)
(BASE_DIR / "data").mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)

# ============================================================
# 网站配置（请根据你的需求修改）
# ============================================================
SITE_CONFIG = {
    "name": "KnowHub",                            # 网站名称
    "title": "KnowHub - 技术笔记与经验分享",       # 首页标题
    "description": "技术笔记、开发经验、学习心得与各种有趣探索的记录站",  # 网站描述
    "keywords": "技术博客,开发笔记,编程经验,学习分享",  # SEO 关键词
    "author": "RainSea",                          # 作者名
    "email": "rainsea127@gmail.com",              # 联系邮箱
}

# ============================================================
# AI 配置
# ============================================================
OPENAI_API_KEY = "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"
OPENAI_MODEL = "gpt-4o-mini"  # 可选: gpt-4o, gpt-4o-mini, gpt-3.5-turbo

# ============================================================
# 会员等级配置
# ============================================================
MEMBER_LEVELS = {
    "free": {
        "name": "游客",
        "daily_ai_limit": 0,      # 禁用 AI，需登录
        "description": "未注册用户"
    },
    "basic": {
        "name": "注册用户",
        "daily_ai_limit": 0,      # 禁用 AI，需升级会员
        "description": "免费注册用户"
    },
    "vip": {
        "name": "VIP 会员",
        "daily_ai_limit": 50,     # 每天 50 次
        "description": "付费 VIP 会员"
    },
    "svip": {
        "name": "SVIP 会员",
        "daily_ai_limit": 200,    # 每天 200 次
        "description": "付费 SVIP 会员"
    }
}

# SQLite 数据库文件
DB_FILE = BASE_DIR / "data" / "knowhub.db"

# 数据库连接锁（线程安全）
_db_lock = threading.Lock()

# ============================================================
# 管理员配置（可修改）
# ============================================================
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "knowhub2024"  # 请修改为你自己的密码
SESSION_EXPIRE_HOURS = 24

# ============================================================
# FastAPI 应用
# ============================================================
app = FastAPI(
    title="KnowHub",
    description="技术笔记与经验分享 - 支持 Markdown 文档管理、全文搜索和 AI 对话",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 数据模型
# ============================================================
class TreeNode(BaseModel):
    id: str
    name: str
    path: Optional[str] = None  # 文件路径（相对于 docs 目录）
    children: Optional[List["TreeNode"]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class CreateNodeRequest(BaseModel):
    parent_id: Optional[str] = None  # None 表示根节点
    name: str

class RenameNodeRequest(BaseModel):
    id: str
    name: str

class MoveNodeRequest(BaseModel):
    id: str
    new_parent_id: Optional[str] = None

class SearchResult(BaseModel):
    id: str
    name: str
    path: str
    snippet: str
    score: int

class AIChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    doc_name: Optional[str] = None

class UserRegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class UserLoginRequest(BaseModel):
    username: str
    password: str

class GenerateCodesRequest(BaseModel):
    count: int = 10
    level: str = "vip"
    days: int = 30  # 会员有效期天数

class ActivateCodeRequest(BaseModel):
    code: str

class CommentRequest(BaseModel):
    doc_id: str
    author: str
    content: str

class Comment(BaseModel):
    id: str
    doc_id: str
    author: str
    content: str
    created_at: str

class LoginRequest(BaseModel):
    username: str
    password: str

# ============================================================
# 工具函数
# ============================================================
def generate_id() -> str:
    """生成唯一 ID"""
    import uuid
    return str(uuid.uuid4())[:8]

def get_timestamp() -> str:
    """获取当前时间戳"""
    return datetime.now().isoformat()

def load_tree() -> List[dict]:
    """加载目录树"""
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

def save_tree(tree: List[dict]):
    """保存目录树"""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)

def load_comments() -> dict:
    """加载评论数据"""
    if COMMENTS_FILE.exists():
        try:
            with open(COMMENTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_comments(comments: dict):
    """保存评论数据"""
    with open(COMMENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(comments, f, ensure_ascii=False, indent=2)

# ============================================================
# SQLite 数据库操作
# ============================================================
@contextmanager
def get_db():
    """获取数据库连接（线程安全）"""
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row  # 返回字典格式
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    """初始化数据库表"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 管理员会话表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                expire_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        
        # 用户表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                email TEXT DEFAULT '',
                level TEXT DEFAULT 'basic',
                level_expire_at TEXT,
                session_token TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        # AI 使用记录表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identifier TEXT NOT NULL,
                date TEXT NOT NULL,
                count INTEGER DEFAULT 0,
                UNIQUE(identifier, date)
            )
        """)
        
        # 激活码表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activation_codes (
                code TEXT PRIMARY KEY,
                level TEXT NOT NULL,
                days INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                used INTEGER DEFAULT 0,
                used_by TEXT,
                used_at TEXT
            )
        """)
        
        # 创建索引
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_usage_identifier ON ai_usage(identifier)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage(date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_session ON users(session_token)")
        
        conn.commit()
        print("✅ 数据库初始化完成")

def migrate_json_to_sqlite():
    """从 JSON 文件迁移数据到 SQLite（仅运行一次）"""
    migrated = False
    
    # 迁移用户数据
    users_file = BASE_DIR / "data" / "users.json"
    if users_file.exists():
        try:
            users = json.loads(users_file.read_text(encoding="utf-8"))
            with get_db() as conn:
                cursor = conn.cursor()
                for username, user in users.items():
                    cursor.execute("""
                        INSERT OR IGNORE INTO users (username, password, email, level, level_expire_at, session_token, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        username,
                        user.get("password", ""),
                        user.get("email", ""),
                        user.get("level", "basic"),
                        user.get("level_expire_at"),
                        user.get("session_token"),
                        user.get("created_at", get_timestamp())
                    ))
            users_file.rename(users_file.with_suffix(".json.bak"))
            print(f"✅ 已迁移 {len(users)} 个用户")
            migrated = True
        except Exception as e:
            print(f"⚠️ 迁移用户数据失败: {e}")
    
    # 迁移管理员会话
    sessions_file = BASE_DIR / "data" / "sessions.json"
    if sessions_file.exists():
        try:
            sessions = json.loads(sessions_file.read_text(encoding="utf-8"))
            with get_db() as conn:
                cursor = conn.cursor()
                for token, session in sessions.items():
                    cursor.execute("""
                        INSERT OR IGNORE INTO admin_sessions (token, username, expire_at, created_at)
                        VALUES (?, ?, ?, ?)
                    """, (
                        token,
                        session.get("username", ""),
                        session.get("expire_at", ""),
                        session.get("created_at", get_timestamp())
                    ))
            sessions_file.rename(sessions_file.with_suffix(".json.bak"))
            print(f"✅ 已迁移 {len(sessions)} 个管理员会话")
            migrated = True
        except Exception as e:
            print(f"⚠️ 迁移管理员会话失败: {e}")
    
    # 迁移 AI 使用记录
    ai_usage_file = BASE_DIR / "data" / "ai_usage.json"
    if ai_usage_file.exists():
        try:
            usage = json.loads(ai_usage_file.read_text(encoding="utf-8"))
            with get_db() as conn:
                cursor = conn.cursor()
                for identifier, dates in usage.items():
                    for date, count in dates.items():
                        cursor.execute("""
                            INSERT OR IGNORE INTO ai_usage (identifier, date, count)
                            VALUES (?, ?, ?)
                        """, (identifier, date, count))
            ai_usage_file.rename(ai_usage_file.with_suffix(".json.bak"))
            print(f"✅ 已迁移 AI 使用记录")
            migrated = True
        except Exception as e:
            print(f"⚠️ 迁移 AI 使用记录失败: {e}")
    
    # 迁移激活码
    codes_file = BASE_DIR / "data" / "activation_codes.json"
    if codes_file.exists():
        try:
            codes = json.loads(codes_file.read_text(encoding="utf-8"))
            with get_db() as conn:
                cursor = conn.cursor()
                for code, info in codes.items():
                    cursor.execute("""
                        INSERT OR IGNORE INTO activation_codes (code, level, days, created_at, used, used_by, used_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        code,
                        info.get("level", "vip"),
                        info.get("days", 30),
                        info.get("created_at", get_timestamp()),
                        1 if info.get("used") else 0,
                        info.get("used_by"),
                        info.get("used_at")
                    ))
            codes_file.rename(codes_file.with_suffix(".json.bak"))
            print(f"✅ 已迁移 {len(codes)} 个激活码")
            migrated = True
        except Exception as e:
            print(f"⚠️ 迁移激活码失败: {e}")
    
    if migrated:
        print("✅ 数据迁移完成！旧 JSON 文件已重命名为 .json.bak")

# ============================================================
# 管理员会话管理（SQLite 版）
# ============================================================
def create_session(username: str) -> str:
    """创建新的管理员会话"""
    token = secrets.token_hex(32)
    expire_at = (datetime.now() + timedelta(hours=SESSION_EXPIRE_HOURS)).isoformat()
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO admin_sessions (token, username, expire_at, created_at)
            VALUES (?, ?, ?, ?)
        """, (token, username, expire_at, get_timestamp()))
    
    return token

def verify_session(token: str) -> Optional[str]:
    """验证管理员会话，返回用户名或 None"""
    if not token:
        return None
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username, expire_at FROM admin_sessions WHERE token = ?", (token,))
        row = cursor.fetchone()
        
        if not row:
            return None
        
        # 检查是否过期
        expire_at = datetime.fromisoformat(row["expire_at"])
        if datetime.now() > expire_at:
            # 删除过期会话
            cursor.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
            return None
        
        return row["username"]

def delete_session(token: str):
    """删除管理员会话"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))

def load_views() -> dict:
    """加载阅读量数据"""
    if VIEWS_FILE.exists():
        try:
            with open(VIEWS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_views(views: dict):
    """保存阅读量数据"""
    with open(VIEWS_FILE, "w", encoding="utf-8") as f:
        json.dump(views, f, ensure_ascii=False, indent=2)

def increment_view(doc_id: str) -> int:
    """增加阅读量并返回当前值"""
    views = load_views()
    views[doc_id] = views.get(doc_id, 0) + 1
    save_views(views)
    return views[doc_id]

def get_view_count(doc_id: str) -> int:
    """获取阅读量"""
    views = load_views()
    return views.get(doc_id, 0)

def get_current_user(session_token: Optional[str] = Cookie(None, alias="knowhub_session")) -> Optional[str]:
    """获取当前登录用户（管理员）"""
    return verify_session(session_token)

def require_admin(session_token: Optional[str] = Cookie(None, alias="knowhub_session")):
    """要求管理员权限"""
    user = verify_session(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    return user

# ============================================================
# 用户/会员系统（SQLite 版）
# ============================================================
def hash_password(password: str) -> str:
    """密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()

def create_user(username: str, password: str, email: str = "") -> dict:
    """创建用户"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 检查用户名是否存在
        cursor.execute("SELECT username FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            raise ValueError("用户名已存在")
        
        created_at = get_timestamp()
        cursor.execute("""
            INSERT INTO users (username, password, email, level, created_at)
            VALUES (?, ?, ?, 'basic', ?)
        """, (username, hash_password(password), email, created_at))
        
        return {
            "username": username,
            "email": email,
            "level": "basic",
            "created_at": created_at,
            "session_token": None
        }

def verify_user(username: str, password: str) -> Optional[dict]:
    """验证用户"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT username, password, email, level, level_expire_at, session_token, created_at 
            FROM users WHERE username = ?
        """, (username,))
        row = cursor.fetchone()
        
        if row and row["password"] == hash_password(password):
            return dict(row)
        return None

def get_user_by_token(token: str) -> Optional[dict]:
    """通过 token 获取用户"""
    if not token:
        return None
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT username, email, level, level_expire_at, session_token, created_at 
            FROM users WHERE session_token = ?
        """, (token,))
        row = cursor.fetchone()
        
        if row:
            return dict(row)
        return None

def create_user_session(username: str) -> str:
    """创建用户会话"""
    token = secrets.token_hex(32)
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET session_token = ? WHERE username = ?", (token, username))
        
        if cursor.rowcount == 0:
            return None
    
    return token

def get_user_ai_usage_today(identifier: str) -> int:
    """获取用户/IP 今日 AI 使用次数"""
    today = datetime.now().strftime("%Y-%m-%d")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT count FROM ai_usage WHERE identifier = ? AND date = ?", (identifier, today))
        row = cursor.fetchone()
        
        return row["count"] if row else 0

def increment_user_ai_usage(identifier: str):
    """增加用户/IP AI 使用次数"""
    today = datetime.now().strftime("%Y-%m-%d")
    
    with get_db() as conn:
        cursor = conn.cursor()
        # 使用 UPSERT 操作
        cursor.execute("""
            INSERT INTO ai_usage (identifier, date, count)
            VALUES (?, ?, 1)
            ON CONFLICT(identifier, date) DO UPDATE SET count = count + 1
        """, (identifier, today))
        
        # 清理 7 天前的记录（每次增加时顺便清理）
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        cursor.execute("DELETE FROM ai_usage WHERE date < ?", (week_ago,))

def check_ai_permission(user: Optional[dict], client_ip: str) -> tuple[bool, str, int, int]:
    """
    检查 AI 使用权限
    返回: (是否允许, 错误消息, 已使用次数, 每日限额)
    """
    if user:
        # 登录用户
        level = user.get("level", "basic")
        level_config = MEMBER_LEVELS.get(level, MEMBER_LEVELS["basic"])
        daily_limit = level_config["daily_ai_limit"]
        used_today = get_user_ai_usage_today(user["username"])
        
        if used_today >= daily_limit:
            return False, f"今日 AI 次数已用完（{level_config['name']}每天 {daily_limit} 次）", used_today, daily_limit
        
        return True, "", used_today, daily_limit
    else:
        # 游客（按 IP 限制）
        level_config = MEMBER_LEVELS["free"]
        daily_limit = level_config["daily_ai_limit"]
        
        ip_key = f"ip:{client_ip}"
        used_today = get_user_ai_usage_today(ip_key)
        
        if used_today >= daily_limit:
            return False, f"游客每天只能使用 {daily_limit} 次 AI，注册后可获得更多次数", used_today, daily_limit
        
        return True, "", used_today, daily_limit

def increment_guest_ai_usage(client_ip: str):
    """增加游客 AI 使用次数"""
    ip_key = f"ip:{client_ip}"
    increment_user_ai_usage(ip_key)

# ============================================================
# 激活码系统（SQLite 版）
# ============================================================
def generate_activation_code() -> str:
    """生成激活码（格式：XXXX-XXXX-XXXX-XXXX）"""
    import string
    chars = string.ascii_uppercase + string.digits
    parts = [''.join(secrets.choice(chars) for _ in range(4)) for _ in range(4)]
    return '-'.join(parts)

def create_activation_codes(count: int, level: str, days: int) -> list:
    """批量创建激活码"""
    new_codes = []
    created_at = get_timestamp()
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        for _ in range(count):
            code = generate_activation_code()
            # 确保不重复
            while True:
                cursor.execute("SELECT code FROM activation_codes WHERE code = ?", (code,))
                if not cursor.fetchone():
                    break
                code = generate_activation_code()
            
            cursor.execute("""
                INSERT INTO activation_codes (code, level, days, created_at, used, used_by, used_at)
                VALUES (?, ?, ?, ?, 0, NULL, NULL)
            """, (code, level, days, created_at))
            new_codes.append(code)
    
    return new_codes

def use_activation_code(code: str, username: str) -> tuple[bool, str, dict]:
    """
    使用激活码
    返回: (成功, 消息, 激活信息)
    """
    code = code.upper().strip()
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 查询激活码
        cursor.execute("SELECT * FROM activation_codes WHERE code = ?", (code,))
        row = cursor.fetchone()
        
        if not row:
            return False, "激活码不存在", {}
        
        if row["used"]:
            return False, f"激活码已被使用（使用者: {row['used_by']}）", {}
        
        # 标记激活码已使用
        cursor.execute("""
            UPDATE activation_codes 
            SET used = 1, used_by = ?, used_at = ?
            WHERE code = ?
        """, (username, get_timestamp(), code))
        
        # 查询用户
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user_row = cursor.fetchone()
        
        if not user_row:
            return False, "用户不存在", {}
        
        level = row["level"]
        days = row["days"]
        
        # 计算到期时间
        current_expire = user_row["level_expire_at"]
        if current_expire:
            try:
                expire_date = datetime.fromisoformat(current_expire)
                if expire_date > datetime.now():
                    # 如果还没过期，在现有基础上增加
                    new_expire = expire_date + timedelta(days=days)
                else:
                    new_expire = datetime.now() + timedelta(days=days)
            except:
                new_expire = datetime.now() + timedelta(days=days)
        else:
            new_expire = datetime.now() + timedelta(days=days)
        
        # 更新用户等级
        cursor.execute("""
            UPDATE users SET level = ?, level_expire_at = ?
            WHERE username = ?
        """, (level, new_expire.isoformat(), username))
        
        level_config = MEMBER_LEVELS.get(level, MEMBER_LEVELS["basic"])
        
        return True, "激活成功", {
            "level": level,
            "level_name": level_config["name"],
            "days": days,
            "expire_date": new_expire.strftime("%Y-%m-%d")
        }

def find_node(tree: List[dict], node_id: str) -> Optional[dict]:
    """在树中查找节点"""
    for node in tree:
        if node["id"] == node_id:
            return node
        if node.get("children"):
            result = find_node(node["children"], node_id)
            if result:
                return result
    return None

def find_parent(tree: List[dict], node_id: str, parent: Optional[dict] = None) -> Optional[dict]:
    """查找节点的父节点"""
    for node in tree:
        if node["id"] == node_id:
            return parent
        if node.get("children"):
            result = find_parent(node["children"], node_id, node)
            if result is not None:
                return result
    return None

def remove_node(tree: List[dict], node_id: str) -> bool:
    """从树中移除节点"""
    for i, node in enumerate(tree):
        if node["id"] == node_id:
            tree.pop(i)
            return True
        if node.get("children"):
            if remove_node(node["children"], node_id):
                return True
    return False

def get_all_files(tree: List[dict]) -> List[dict]:
    """获取所有有内容的节点"""
    files = []
    for node in tree:
        if node.get("path"):
            files.append(node)
        if node.get("children"):
            files.extend(get_all_files(node["children"]))
    return files

def sanitize_filename(name: str) -> str:
    """清理文件名"""
    # 移除不安全字符
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    return name.strip()

def read_markdown_file(file_path: str) -> dict:
    """读取 Markdown 文件"""
    full_path = DOCS_DIR / file_path
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    content = full_path.read_text(encoding="utf-8")
    
    # 提取 front matter
    metadata = {}
    body = content
    if content.startswith("---"):
        end_idx = content.find("---", 3)
        if end_idx > 0:
            front_matter = content[3:end_idx].strip()
            body = content[end_idx+3:].strip()
            for line in front_matter.split("\n"):
                if ":" in line:
                    key, value = line.split(":", 1)
                    metadata[key.strip()] = value.strip().strip('"')
    
    # 转换为 HTML
    html_content = markdown.markdown(
        body,
        extensions=['tables', 'fenced_code', 'codehilite', 'toc', 'nl2br']
    )
    
    return {
        "path": file_path,
        "metadata": metadata,
        "content": body,
        "html": html_content
    }

# ============================================================
# 认证 API
# ============================================================
@app.post("/api/auth/login")
def login(request: LoginRequest, response: Response):
    """管理员登录"""
    if request.username != ADMIN_USERNAME or request.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    token = create_session(request.username)
    response.set_cookie(
        key="knowhub_session",
        value=token,
        httponly=True,
        max_age=SESSION_EXPIRE_HOURS * 3600,
        samesite="lax"
    )
    return {"status": "ok", "username": request.username}

@app.post("/api/auth/logout")
def logout(response: Response, session_token: Optional[str] = Cookie(None, alias="knowhub_session")):
    """登出"""
    if session_token:
        delete_session(session_token)
    response.delete_cookie("knowhub_session")
    return {"status": "ok"}

@app.get("/api/auth/me")
def get_me(
    session_token: Optional[str] = Cookie(None, alias="knowhub_session"),
    user_token: Optional[str] = Cookie(None, alias="knowhub_user")
):
    """获取当前用户信息"""
    # 先检查管理员
    admin_user = verify_session(session_token)
    if admin_user:
        return {"logged_in": True, "username": admin_user, "is_admin": True, "level": "admin", "level_name": "管理员"}
    
    # 再检查普通用户
    user = get_user_by_token(user_token)
    if user:
        level = user.get("level", "basic")
        level_config = MEMBER_LEVELS.get(level, MEMBER_LEVELS["basic"])
        used_today = get_user_ai_usage_today(user["username"])
        return {
            "logged_in": True, 
            "username": user["username"], 
            "is_admin": False,
            "level": level,
            "level_name": level_config["name"],
            "ai_limit": level_config["daily_ai_limit"],
            "ai_used_today": used_today
        }
    
    return {"logged_in": False, "username": None, "is_admin": False, "level": "free", "level_name": "游客"}

# ============================================================
# 用户注册/登录 API
# ============================================================
@app.post("/api/user/register")
def user_register(request: UserRegisterRequest, response: Response):
    """用户注册"""
    username = request.username.strip()
    password = request.password
    email = request.email or ""
    
    # 验证用户名
    if len(username) < 2 or len(username) > 20:
        raise HTTPException(status_code=400, detail="用户名长度需要 2-20 个字符")
    if not username.isalnum():
        raise HTTPException(status_code=400, detail="用户名只能包含字母和数字")
    
    # 验证密码
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 个字符")
    
    try:
        user = create_user(username, password, email)
        token = create_user_session(username)
        
        response.set_cookie(
            key="knowhub_user",
            value=token,
            httponly=True,
            max_age=30 * 24 * 3600,  # 30 天
            samesite="lax"
        )
        
        level_config = MEMBER_LEVELS["basic"]
        return {
            "status": "ok", 
            "username": username,
            "level": "basic",
            "level_name": level_config["name"],
            "ai_limit": level_config["daily_ai_limit"]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/user/login")
def user_login(request: UserLoginRequest, response: Response):
    """用户登录"""
    user = verify_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    token = create_user_session(request.username)
    response.set_cookie(
        key="knowhub_user",
        value=token,
        httponly=True,
        max_age=30 * 24 * 3600,
        samesite="lax"
    )
    
    level = user.get("level", "basic")
    level_config = MEMBER_LEVELS.get(level, MEMBER_LEVELS["basic"])
    used_today = get_user_ai_usage_today(request.username)
    
    return {
        "status": "ok",
        "username": request.username,
        "level": level,
        "level_name": level_config["name"],
        "ai_limit": level_config["daily_ai_limit"],
        "ai_used_today": used_today
    }

@app.post("/api/user/logout")
def user_logout(response: Response):
    """用户登出"""
    response.delete_cookie("knowhub_user")
    return {"status": "ok"}

@app.get("/api/user/ai-status")
def get_ai_status(
    request: Request,
    user_token: Optional[str] = Cookie(None, alias="knowhub_user"),
    session_token: Optional[str] = Cookie(None, alias="knowhub_session")
):
    """获取 AI 使用状态"""
    # 检查是否是管理员
    admin_user = verify_session(session_token)
    if admin_user:
        return {
            "allowed": True,
            "message": "",
            "used_today": 0,
            "daily_limit": -1,  # -1 表示无限
            "level": "admin",
            "level_name": "管理员"
        }
    
    user = get_user_by_token(user_token)
    client_ip = request.client.host
    
    allowed, error_msg, used, limit = check_ai_permission(user, client_ip)
    
    if user:
        level = user.get("level", "basic")
        level_config = MEMBER_LEVELS.get(level, MEMBER_LEVELS["basic"])
    else:
        level = "free"
        level_config = MEMBER_LEVELS["free"]
    
    return {
        "allowed": allowed,
        "message": error_msg,
        "used_today": used,
        "daily_limit": limit,
        "level": level,
        "level_name": level_config["name"]
    }

@app.get("/api/member/levels")
def get_member_levels():
    """获取会员等级列表"""
    return {
        "levels": [
            {"id": k, **v} for k, v in MEMBER_LEVELS.items()
        ]
    }

@app.put("/api/admin/user/{username}/level")
def set_user_level(
    username: str,
    level: str = Query(...),
    _: str = Depends(require_admin)
):
    """管理员设置用户会员等级"""
    if level not in MEMBER_LEVELS:
        raise HTTPException(status_code=400, detail=f"无效的等级，可选: {', '.join(MEMBER_LEVELS.keys())}")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET level = ? WHERE username = ?", (level, username))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="用户不存在")
    
    level_config = MEMBER_LEVELS[level]
    return {
        "status": "ok",
        "username": username,
        "level": level,
        "level_name": level_config["name"],
        "daily_ai_limit": level_config["daily_ai_limit"]
    }

@app.get("/api/admin/users")
def list_users(_: str = Depends(require_admin)):
    """管理员获取所有用户"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username, email, level, level_expire_at, created_at FROM users ORDER BY created_at DESC")
        rows = cursor.fetchall()
    
    result = []
    for row in rows:
        level = row["level"] or "basic"
        level_config = MEMBER_LEVELS.get(level, MEMBER_LEVELS["basic"])
        used_today = get_user_ai_usage_today(row["username"])
        result.append({
            "username": row["username"],
            "email": row["email"] or "",
            "level": level,
            "level_name": level_config["name"],
            "ai_limit": level_config["daily_ai_limit"],
            "ai_used_today": used_today,
            "created_at": row["created_at"] or "",
            "vip_expire": row["level_expire_at"] or ""
        })
    return {"users": result}

# ============================================================
# 激活码 API
# ============================================================
@app.post("/api/admin/codes/generate")
def generate_codes(request: GenerateCodesRequest, _: str = Depends(require_admin)):
    """管理员生成激活码"""
    if request.level not in MEMBER_LEVELS:
        raise HTTPException(status_code=400, detail=f"无效的等级，可选: {', '.join(MEMBER_LEVELS.keys())}")
    
    if request.count < 1 or request.count > 100:
        raise HTTPException(status_code=400, detail="生成数量需要在 1-100 之间")
    
    if request.days < 1 or request.days > 365:
        raise HTTPException(status_code=400, detail="有效期需要在 1-365 天之间")
    
    codes = create_activation_codes(request.count, request.level, request.days)
    level_config = MEMBER_LEVELS[request.level]
    
    return {
        "status": "ok",
        "codes": codes,
        "count": len(codes),
        "level": request.level,
        "level_name": level_config["name"],
        "days": request.days
    }

@app.get("/api/admin/codes")
def list_codes(_: str = Depends(require_admin)):
    """管理员查看所有激活码"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM activation_codes ORDER BY created_at DESC")
        rows = cursor.fetchall()
    
    result = []
    for row in rows:
        level_config = MEMBER_LEVELS.get(row["level"], MEMBER_LEVELS["basic"])
        result.append({
            "code": row["code"],
            "level": row["level"],
            "level_name": level_config["name"],
            "days": row["days"],
            "used": bool(row["used"]),
            "used_by": row["used_by"],
            "used_at": row["used_at"],
            "created_at": row["created_at"]
        })
    
    return {"codes": result}

@app.delete("/api/admin/codes/{code}")
def delete_code(code: str, _: str = Depends(require_admin)):
    """管理员删除激活码"""
    code = code.upper()
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM activation_codes WHERE code = ?", (code,))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="激活码不存在")
    
    return {"status": "ok"}

@app.post("/api/user/activate")
def activate_code(
    request: ActivateCodeRequest,
    user_token: Optional[str] = Cookie(None, alias="knowhub_user")
):
    """用户使用激活码"""
    user = get_user_by_token(user_token)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    
    success, message, info = use_activation_code(request.code, user["username"])
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "status": "ok",
        "message": message,
        **info
    }

# ============================================================
# API 路由
# ============================================================

@app.get("/api/tree")
def get_tree():
    """获取目录树"""
    return load_tree()

class MoveNodeRequest(BaseModel):
    node_id: str
    target_id: str
    position: str  # 'before', 'after', 'inside'

@app.post("/api/tree/move")
def move_node(request: MoveNodeRequest, user: str = Depends(require_admin)):
    """移动节点（拖放排序）- 需要管理员权限"""
    tree = load_tree()
    
    # 找到要移动的节点
    node = find_node(tree, request.node_id)
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    
    # 找到目标节点
    target = find_node(tree, request.target_id)
    if not target:
        raise HTTPException(status_code=404, detail="目标节点不存在")
    
    # 防止将节点移动到自己的子节点中
    def is_descendant(parent_node, child_id):
        if parent_node["id"] == child_id:
            return True
        for child in parent_node.get("children", []):
            if is_descendant(child, child_id):
                return True
        return False
    
    if is_descendant(node, request.target_id):
        raise HTTPException(status_code=400, detail="不能将节点移动到自己的子节点中")
    
    # 从原位置移除节点
    def remove_from_tree(nodes, node_id):
        for i, n in enumerate(nodes):
            if n["id"] == node_id:
                return nodes.pop(i)
            if n.get("children"):
                removed = remove_from_tree(n["children"], node_id)
                if removed:
                    return removed
        return None
    
    removed_node = remove_from_tree(tree, request.node_id)
    if not removed_node:
        raise HTTPException(status_code=404, detail="节点移除失败")
    
    # 找到目标节点的父节点和索引
    def find_parent_and_index(nodes, target_id, parent=None):
        for i, n in enumerate(nodes):
            if n["id"] == target_id:
                return parent, nodes, i
            if n.get("children"):
                result = find_parent_and_index(n["children"], target_id, n)
                if result[0] is not None or result[1] is not None:
                    return result
        return None, None, -1
    
    parent_node, siblings, target_index = find_parent_and_index(tree, request.target_id)
    
    if siblings is None:
        # 目标是根节点
        siblings = tree
        for i, n in enumerate(tree):
            if n["id"] == request.target_id:
                target_index = i
                break
    
    # 根据 position 插入节点
    if request.position == 'before':
        siblings.insert(target_index, removed_node)
    elif request.position == 'after':
        siblings.insert(target_index + 1, removed_node)
    elif request.position == 'inside':
        # 放到目标节点内部（作为子节点）
        target = find_node(tree, request.target_id)
        if "children" not in target:
            target["children"] = []
        target["children"].append(removed_node)
    
    removed_node["updated_at"] = get_timestamp()
    save_tree(tree)
    
    return {"status": "ok"}

@app.post("/api/node")
def create_node(request: CreateNodeRequest, user: str = Depends(require_admin)):
    """创建文档节点（每个节点都可以有内容和子节点）- 需要管理员权限"""
    tree = load_tree()
    
    new_node = {
        "id": generate_id(),
        "name": sanitize_filename(request.name),
        "path": None,  # 文件路径稍后上传时设置
        "children": [],  # 每个节点都可以有子节点
        "created_at": get_timestamp(),
        "updated_at": get_timestamp(),
    }
    
    if request.parent_id:
        parent = find_node(tree, request.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="父节点不存在")
        if "children" not in parent:
            parent["children"] = []
        parent["children"].append(new_node)
    else:
        tree.append(new_node)
    
    save_tree(tree)
    return new_node

@app.put("/api/node/rename")
def rename_node(request: RenameNodeRequest, user: str = Depends(require_admin)):
    """重命名节点 - 需要管理员权限"""
    tree = load_tree()
    node = find_node(tree, request.id)
    
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    
    old_name = node["name"]
    new_name = sanitize_filename(request.name)
    node["name"] = new_name
    node["updated_at"] = get_timestamp()
    
    # 如果有关联文件，同时重命名实际文件
    if node.get("path"):
        old_path = DOCS_DIR / node["path"]
        if old_path.exists():
            new_filename = new_name if new_name.endswith(".md") else f"{new_name}.md"
            new_path = old_path.parent / new_filename
            old_path.rename(new_path)
            node["path"] = str(new_path.relative_to(DOCS_DIR)).replace("\\", "/")
    
    save_tree(tree)
    return node

@app.delete("/api/node/{node_id}")
def delete_node(node_id: str, user: str = Depends(require_admin)):
    """删除节点 - 需要管理员权限"""
    tree = load_tree()
    node = find_node(tree, node_id)
    
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    
    # 递归删除所有文件（包括自己和子节点）
    def delete_files(n):
        if n.get("path"):
            file_path = DOCS_DIR / n["path"]
            if file_path.exists():
                file_path.unlink()
        if n.get("children"):
            for child in n["children"]:
                delete_files(child)
    
    delete_files(node)
    remove_node(tree, node_id)
    save_tree(tree)
    return {"status": "ok"}

@app.post("/api/upload/{node_id}")
async def upload_file(node_id: str, file: UploadFile = File(...), user: str = Depends(require_admin)):
    """上传文件到指定节点 - 需要管理员权限"""
    if not file.filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="只支持 .md 文件")
    
    tree = load_tree()
    node = find_node(tree, node_id)
    
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    
    # 生成文件路径
    filename = sanitize_filename(file.filename)
    if not filename.endswith(".md"):
        filename += ".md"
    
    # 如果有旧文件，删除
    if node.get("path"):
        old_path = DOCS_DIR / node["path"]
        if old_path.exists():
            old_path.unlink()
    
    # 保存新文件
    file_path = DOCS_DIR / filename
    
    # 避免文件名冲突
    counter = 1
    while file_path.exists():
        name_part = filename.rsplit(".", 1)[0]
        file_path = DOCS_DIR / f"{name_part}_{counter}.md"
        counter += 1
    
    content = await file.read()
    file_path.write_bytes(content)
    
    # 更新节点
    node["path"] = str(file_path.relative_to(DOCS_DIR)).replace("\\", "/")
    node["updated_at"] = get_timestamp()
    
    save_tree(tree)
    return {"status": "ok", "path": node["path"]}

@app.get("/api/doc/{node_id}")
def get_document(node_id: str, count_view: bool = True):
    """获取文档内容"""
    tree = load_tree()
    node = find_node(tree, node_id)
    
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    
    if not node.get("path"):
        return {
            "id": node_id,
            "name": node["name"],
            "content": "",
            "html": "<p style='color: #666;'>请上传 Markdown 文件</p>",
            "empty": True,
            "views": 0,
            "created_at": node.get("created_at"),
            "updated_at": node.get("updated_at")
        }
    
    # 增加阅读量
    views = increment_view(node_id) if count_view else get_view_count(node_id)
    
    doc = read_markdown_file(node["path"])
    doc["id"] = node_id
    doc["name"] = node["name"]
    doc["empty"] = False
    doc["views"] = views
    doc["created_at"] = node.get("created_at")
    doc["updated_at"] = node.get("updated_at")
    return doc

@app.get("/api/search")
def search_documents(q: str = Query(..., min_length=1)):
    """全文搜索"""
    tree = load_tree()
    files = get_all_files(tree)
    
    results = []
    query_lower = q.lower()
    query_terms = query_lower.split()
    
    for file_node in files:
        if not file_node.get("path"):
            continue
        
        file_path = DOCS_DIR / file_node["path"]
        if not file_path.exists():
            continue
        
        try:
            content = file_path.read_text(encoding="utf-8")
            content_lower = content.lower()
            
            # 计算匹配分数
            score = 0
            
            # 标题匹配权重更高
            if query_lower in file_node["name"].lower():
                score += 100
            
            # 内容匹配
            for term in query_terms:
                score += content_lower.count(term) * 10
            
            if score > 0:
                # 提取摘要
                snippet = ""
                for para in content.split("\n\n"):
                    if any(term in para.lower() for term in query_terms):
                        # 清理 markdown 语法
                        clean_para = re.sub(r'[#*`\[\]()]', '', para)
                        snippet = clean_para[:200] + "..." if len(clean_para) > 200 else clean_para
                        break
                
                if not snippet:
                    # 取前200字符
                    clean_content = re.sub(r'[#*`\[\]()]', '', content)
                    snippet = clean_content[:200] + "..."
                
                results.append({
                    "id": file_node["id"],
                    "name": file_node["name"],
                    "path": file_node["path"],
                    "snippet": snippet.strip(),
                    "score": score
                })
        except Exception as e:
            continue
    
    # 按分数排序
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"results": results[:20], "total": len(results)}

@app.put("/api/node/move")
def move_node(request: MoveNodeRequest, user: str = Depends(require_admin)):
    """移动节点到新的父节点 - 需要管理员权限"""
    tree = load_tree()
    node = find_node(tree, request.id)
    
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    
    # 从原位置移除
    remove_node(tree, request.id)
    
    # 添加到新位置
    if request.new_parent_id:
        new_parent = find_node(tree, request.new_parent_id)
        if not new_parent:
            raise HTTPException(status_code=404, detail="目标父节点不存在")
        if "children" not in new_parent:
            new_parent["children"] = []
        new_parent["children"].append(node)
    else:
        tree.append(node)
    
    node["updated_at"] = get_timestamp()
    save_tree(tree)
    return node

# ============================================================
# 评论 API
# ============================================================
@app.get("/api/comments/{doc_id}")
def get_comments(doc_id: str):
    """获取文档的评论列表"""
    comments = load_comments()
    doc_comments = comments.get(doc_id, [])
    # 按时间倒序排列
    doc_comments.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"comments": doc_comments, "total": len(doc_comments)}

@app.post("/api/comments")
def add_comment(request: CommentRequest):
    """添加评论"""
    if not request.author.strip():
        raise HTTPException(status_code=400, detail="请输入昵称")
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="请输入评论内容")
    if len(request.content) > 2000:
        raise HTTPException(status_code=400, detail="评论内容不能超过2000字")
    
    comments = load_comments()
    
    new_comment = {
        "id": generate_id(),
        "doc_id": request.doc_id,
        "author": request.author.strip()[:50],  # 限制昵称长度
        "content": request.content.strip(),
        "created_at": get_timestamp()
    }
    
    if request.doc_id not in comments:
        comments[request.doc_id] = []
    
    comments[request.doc_id].append(new_comment)
    save_comments(comments)
    
    return new_comment

@app.delete("/api/comments/{comment_id}")
def delete_comment(comment_id: str, doc_id: str):
    """删除评论"""
    comments = load_comments()
    
    if doc_id not in comments:
        raise HTTPException(status_code=404, detail="评论不存在")
    
    original_len = len(comments[doc_id])
    comments[doc_id] = [c for c in comments[doc_id] if c["id"] != comment_id]
    
    if len(comments[doc_id]) == original_len:
        raise HTTPException(status_code=404, detail="评论不存在")
    
    save_comments(comments)
    return {"status": "ok"}

# ============================================================
# AI 对话 API
# ============================================================
@app.post("/api/ai/chat")
async def ai_chat(
    request: Request,
    chat_request: AIChatRequest,
    user_token: Optional[str] = Cookie(None, alias="knowhub_user"),
    session_token: Optional[str] = Cookie(None, alias="knowhub_session")
):
    """AI 对话接口 - 接入 OpenAI（会员系统）"""
    
    # 0. 检查是否是管理员（管理员无限制）
    admin_user = verify_session(session_token)
    is_admin = admin_user is not None
    
    # 1. 获取用户信息
    user = get_user_by_token(user_token)
    
    # 2. 获取客户端 IP（用于游客限制）
    client_ip = request.client.host
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    
    # 3. 检查 AI 使用权限（管理员跳过）
    if not is_admin:
        allowed, error_msg, used, limit = check_ai_permission(user, client_ip)
        if not allowed:
            raise HTTPException(status_code=429, detail=error_msg)
    
    user_message = chat_request.message
    doc_context = chat_request.context or ""
    doc_name = chat_request.doc_name or "未知文档"
    
    # 检查 API Key
    if not OPENAI_API_KEY:
        return {"reply": "⚠️ AI 服务未配置，请在 app.py 中设置 OPENAI_API_KEY"}
    
    # 构建系统提示
    system_prompt = f"""你是 KnowHub 知识库的 AI 助手，帮助用户理解和分析文档内容。

当前用户正在阅读的文档：「{doc_name}」

文档内容：
---
{doc_context[:8000] if doc_context else "（用户未选择文档）"}
---

请根据文档内容回答用户问题。如果问题与文档无关，也可以友好地回答。
回复要简洁、专业、有帮助。使用中文回复。"""

    # 记录使用次数（管理员不记录）- 在流开始前记录
    if not is_admin:
        if user:
            increment_user_ai_usage(user["username"])
        else:
            increment_guest_ai_usage(client_ip)
    
    async def generate_stream():
        """生成流式响应"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": OPENAI_MODEL,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_message}
                        ],
                        "max_tokens": 2000,
                        "temperature": 0.7,
                        "stream": True
                    }
                ) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'error': 'AI 请求失败'})}\n\n"
                        return
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str.strip() == "[DONE]":
                                yield "data: [DONE]\n\n"
                                break
                            try:
                                data = json.loads(data_str)
                                delta = data.get("choices", [{}])[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield f"data: {json.dumps({'content': content})}\n\n"
                            except json.JSONDecodeError:
                                pass
        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': 'AI 响应超时'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# ============================================================
# AI 生成文档树
# ============================================================
class GenerateTreeRequest(BaseModel):
    prompt: str
    depth: int = 3

class ConfirmTreeRequest(BaseModel):
    tree: List[dict]
    parent_id: Optional[str] = None  # 父节点 ID，如果指定则在父节点下创建

@app.post("/api/ai/generate-tree")
async def ai_generate_tree(
    request: GenerateTreeRequest,
    session_token: Optional[str] = Cookie(None, alias="knowhub_session")
):
    """AI 生成文档目录结构（仅管理员）"""
    admin_user = verify_session(session_token)
    if not admin_user:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="AI 服务未配置")
    
    depth_desc = {
        1: "只需要一级目录（章节）",
        2: "需要两级目录（章节 > 小节）",
        3: "需要三级目录（章节 > 小节 > 详细内容）"
    }
    
    system_prompt = f"""你是一个文档结构专家。用户会描述他们想要创建的文档内容，你需要帮他们生成一个合理的文档目录结构。

要求：
1. {depth_desc.get(request.depth, depth_desc[3])}
2. 每个章节下的内容要有逻辑性和完整性
3. 命名要简洁明了
4. 返回 JSON 格式，结构如下：
[
  {{
    "name": "章节名称",
    "children": [
      {{
        "name": "小节名称",
        "children": [...]
      }}
    ]
  }}
]

只返回 JSON 数组，不要有其他内容。"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": request.prompt}
                    ],
                    "max_tokens": 2000,
                    "temperature": 0.7
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="AI 请求失败")
            
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            # 解析 JSON
            # 提取 JSON 部分（可能被包裹在 ```json``` 中）
            import re
            json_match = re.search(r'\[[\s\S]*\]', content)
            if not json_match:
                raise HTTPException(status_code=500, detail="AI 返回格式错误")
            
            tree = json.loads(json_match.group())
            return {"tree": tree}
            
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="解析 AI 返回内容失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/confirm-tree")
def confirm_ai_tree(
    request: ConfirmTreeRequest,
    session_token: Optional[str] = Cookie(None, alias="knowhub_session")
):
    """确认并创建 AI 生成的文档树（仅管理员）"""
    admin_user = verify_session(session_token)
    if not admin_user:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    
    tree = load_tree()
    
    def create_nodes(items: List[dict], parent_path: str = "") -> List[dict]:
        """递归创建节点"""
        result = []
        for item in items:
            node_id = generate_id()
            node_name = item.get("name", "未命名")
            
            # 创建 Markdown 文件
            safe_name = sanitize_filename(node_name)
            if parent_path:
                file_name = f"{parent_path}_{safe_name}.md"
            else:
                file_name = f"{safe_name}.md"
            
            file_path = DOCS_DIR / file_name
            if not file_path.exists():
                file_path.write_text(f"# {node_name}\n\n", encoding="utf-8")
            
            node = {
                "id": node_id,
                "name": node_name,
                "path": file_name,
                "created_at": get_timestamp(),
                "updated_at": get_timestamp()
            }
            
            # 递归创建子节点
            if item.get("children"):
                node["children"] = create_nodes(item["children"], safe_name)
            
            result.append(node)
        
        return result
    
    new_nodes = create_nodes(request.tree)
    
    # 如果指定了父节点，则添加到父节点下
    if request.parent_id:
        parent = find_node(tree, request.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="父节点不存在")
        if "children" not in parent:
            parent["children"] = []
        parent["children"].extend(new_nodes)
    else:
        tree.extend(new_nodes)
    
    save_tree(tree)
    
    return {"status": "ok", "created": len(new_nodes)}

# ============================================================
# SEO 相关
# ============================================================
def get_doc_meta(node_id: str) -> dict:
    """获取文档的 SEO 元信息"""
    tree = load_tree()
    node = find_node(tree, node_id)
    
    site_name = SITE_CONFIG["name"]
    
    if not node:
        return {"title": SITE_CONFIG["title"], "description": SITE_CONFIG["description"]}
    
    title = f"{node['name']} - {site_name}"
    description = ""
    
    if node.get("path"):
        file_path = DOCS_DIR / node["path"]
        if file_path.exists():
            content = file_path.read_text(encoding="utf-8")
            # 提取前200字作为描述
            clean_content = re.sub(r'[#*`\[\]()>\-]', '', content)
            clean_content = re.sub(r'\n+', ' ', clean_content).strip()
            description = clean_content[:200] + "..." if len(clean_content) > 200 else clean_content
    
    if not description:
        description = f"{node['name']} - {SITE_CONFIG['description']}"
    
    return {"title": title, "description": description, "name": node["name"]}

def render_page_with_meta(title: str = None, description: str = None, doc_id: str = None):
    """渲染带有 SEO meta 标签的页面"""
    html_path = TEMPLATES_DIR / "index.html"
    if not html_path.exists():
        return f"<h1>{SITE_CONFIG['name']}</h1><p>请创建 templates/index.html</p>"
    
    html = html_path.read_text(encoding="utf-8")
    
    # 使用默认值
    if title is None:
        title = SITE_CONFIG["title"]
    if description is None:
        description = SITE_CONFIG["description"]
    
    keywords = SITE_CONFIG["keywords"]
    author = SITE_CONFIG["author"]
    site_name = SITE_CONFIG["name"]
    
    # 替换 title
    html = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', html)
    
    # 添加 meta 标签
    meta_tags = f'''
    <meta name="description" content="{description}">
    <meta name="keywords" content="{keywords}">
    <meta name="author" content="{author}">
    <meta property="og:site_name" content="{site_name}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{description}">
    '''
    
    # 添加站点配置脚本
    site_config_script = f'''
    <script>
        window.SITE_CONFIG = {json.dumps(SITE_CONFIG, ensure_ascii=False)};
        window.AUTO_LOAD_DOC_ID = {json.dumps(doc_id)};
    </script>
    '''
    html = html.replace('</head>', f'{meta_tags}{site_config_script}</head>')
    
    # 替换页面中的站点名称占位符
    html = html.replace('{{SITE_NAME}}', site_name)
    
    return html

# ============================================================
# 页面路由
# ============================================================
@app.get("/", response_class=HTMLResponse)
def index():
    """首页"""
    return render_page_with_meta()

@app.get("/admin", response_class=HTMLResponse)
def admin_page():
    """管理员登录页面"""
    html = render_page_with_meta(title=f"管理登录 - {SITE_CONFIG['name']}")
    # 添加自动弹出登录框的脚本
    auto_login_script = '''
    <script>
        window.AUTO_SHOW_LOGIN = true;
    </script>
    '''
    html = html.replace('</body>', f'{auto_login_script}</body>')
    return html

@app.get("/doc/{doc_id}", response_class=HTMLResponse)
def doc_page(doc_id: str):
    """文档页面（SEO 友好的独立 URL）"""
    meta = get_doc_meta(doc_id)
    return render_page_with_meta(
        title=meta.get("title", "KnowHub"),
        description=meta.get("description", ""),
        doc_id=doc_id
    )

@app.get("/sitemap.xml")
def sitemap():
    """生成 sitemap.xml"""
    tree = load_tree()
    files = get_all_files(tree)
    
    # 获取所有节点（包括文件夹）
    def get_all_nodes(nodes):
        result = []
        for node in nodes:
            result.append(node)
            if node.get("children"):
                result.extend(get_all_nodes(node["children"]))
        return result
    
    all_nodes = get_all_nodes(tree)
    
    # 生成 sitemap XML
    urls = ['<?xml version="1.0" encoding="UTF-8"?>']
    urls.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    
    # 首页
    urls.append('''  <url>
    <loc>/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>''')
    
    # 所有文档页面
    for node in all_nodes:
        updated = node.get("updated_at", node.get("created_at", ""))
        lastmod = ""
        if updated:
            lastmod = f"\n    <lastmod>{updated[:10]}</lastmod>"
        
        urls.append(f'''  <url>
    <loc>/doc/{node["id"]}</loc>{lastmod}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>''')
    
    urls.append('</urlset>')
    
    return Response(
        content="\n".join(urls),
        media_type="application/xml"
    )

@app.get("/robots.txt")
def robots():
    """robots.txt"""
    content = """User-agent: *
Allow: /
Sitemap: /sitemap.xml
"""
    return Response(content=content, media_type="text/plain")

@app.get("/rss.xml")
def rss_feed():
    """RSS 订阅"""
    tree = load_tree()
    files = get_all_files(tree)
    
    site_name = SITE_CONFIG["name"]
    site_desc = SITE_CONFIG["description"]
    
    # 按更新时间排序
    files_with_time = []
    for node in files:
        updated = node.get("updated_at", node.get("created_at", ""))
        files_with_time.append((node, updated))
    files_with_time.sort(key=lambda x: x[1], reverse=True)
    
    # 生成 RSS XML
    items = []
    for node, updated in files_with_time[:20]:  # 最近20篇
        title = node["name"]
        link = f"/doc/{node['id']}"
        
        # 获取文章摘要
        description = ""
        if node.get("path"):
            file_path = DOCS_DIR / node["path"]
            if file_path.exists():
                content = file_path.read_text(encoding="utf-8")
                clean = re.sub(r'[#*`\[\]()>\-]', '', content)
                clean = re.sub(r'\n+', ' ', clean).strip()
                description = clean[:300] + "..." if len(clean) > 300 else clean
        
        pub_date = ""
        if updated:
            try:
                dt = datetime.fromisoformat(updated)
                pub_date = dt.strftime("%a, %d %b %Y %H:%M:%S +0800")
            except:
                pass
        
        items.append(f'''    <item>
      <title>{title}</title>
      <link>{link}</link>
      <description><![CDATA[{description}]]></description>
      <pubDate>{pub_date}</pubDate>
      <guid>{link}</guid>
    </item>''')
    
    rss = f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>{site_name}</title>
    <link>/</link>
    <description>{site_desc}</description>
    <language>zh-CN</language>
    <lastBuildDate>{datetime.now().strftime("%a, %d %b %Y %H:%M:%S +0800")}</lastBuildDate>
{chr(10).join(items)}
  </channel>
</rss>'''
    
    return Response(content=rss, media_type="application/xml")

@app.get("/about", response_class=HTMLResponse)
def about_page():
    """关于页面"""
    return render_page_with_meta(
        title=f"关于 - {SITE_CONFIG['name']}",
        description=f"关于 {SITE_CONFIG['name']} 和作者",
        doc_id="__about__"
    )

# ============================================================
# 图片上传
# ============================================================
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg"
}

@app.post("/api/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    _: str = Depends(require_admin)
):
    """上传图片"""
    # 检查文件类型
    content_type = file.content_type
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="不支持的图片格式，支持: JPG, PNG, GIF, WebP, SVG")
    
    # 生成唯一文件名
    ext = ALLOWED_IMAGE_TYPES[content_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    
    # 按年月组织目录
    now = datetime.now()
    subdir = f"{now.year}/{now.month:02d}"
    save_dir = IMAGES_DIR / subdir
    save_dir.mkdir(parents=True, exist_ok=True)
    
    # 保存文件
    file_path = save_dir / filename
    content = await file.read()
    
    # 限制文件大小 (5MB)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片大小不能超过 5MB")
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    # 返回访问 URL
    url = f"/images/{subdir}/{filename}"
    return {"url": url, "filename": filename}

@app.get("/api/images")
def list_images(_: str = Depends(require_admin)):
    """列出所有图片"""
    images = []
    for img_file in IMAGES_DIR.rglob("*"):
        if img_file.is_file() and img_file.suffix.lower() in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]:
            rel_path = img_file.relative_to(IMAGES_DIR)
            images.append({
                "url": f"/images/{str(rel_path).replace(chr(92), '/')}",
                "name": img_file.name,
                "size": img_file.stat().st_size,
                "modified": datetime.fromtimestamp(img_file.stat().st_mtime).isoformat()
            })
    
    # 按修改时间倒序
    images.sort(key=lambda x: x["modified"], reverse=True)
    return {"images": images}

# 挂载静态文件
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# 挂载图片目录
if IMAGES_DIR.exists():
    app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

# ============================================================
# 启动
# ============================================================
# 初始化数据库
init_db()

# 迁移旧数据（如果存在）
migrate_json_to_sqlite()

# 默认端口
PORT = int(os.getenv("PORT", 8000))

if __name__ == "__main__":
    print("=" * 50)
    print("  KnowHub - 个人知识库")
    print("=" * 50)
    print(f"  访问地址: http://localhost:{PORT}")
    print(f"  文档目录: {DOCS_DIR}")
    print(f"  数据库: {DB_FILE}")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=PORT)

