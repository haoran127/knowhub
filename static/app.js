/**
 * KnowHub - 个人知识库
 * 前端交互逻辑
 */

// ============================================================
// 全局状态
// ============================================================
let treeData = [];
let currentNodeId = null;
let contextNodeId = null;
let pendingAction = null;
let searchTimeout = null;
let isAdmin = false;
let currentUser = null;

// ============================================================
// 管理员面板
// ============================================================
let adminCodesData = [];
let adminUsersData = [];
let currentAdminTab = 'codes';

function toggleAdminPanel() {
    const panel = document.getElementById('adminPanel');
    const isHidden = panel.classList.contains('hidden');
    
    if (isHidden) {
        panel.classList.remove('hidden');
        // 根据当前标签加载数据
        if (currentAdminTab === 'codes') {
            loadAdminCodes();
        } else {
            loadAdminUsers();
        }
    } else {
        panel.classList.add('hidden');
    }
}

function switchAdminTab(tab) {
    currentAdminTab = tab;
    
    // 更新标签按钮状态
    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // 更新内容面板
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`adminTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
    
    // 加载数据
    if (tab === 'codes') {
        loadAdminCodes();
    } else {
        loadAdminUsers();
    }
}

// 加载激活码列表
async function loadAdminCodes() {
    const container = document.getElementById('codesListContainer');
    container.innerHTML = '<div class="loading-text">加载中...</div>';
    
    try {
        const data = await api('/admin/codes');
        adminCodesData = data.codes || [];
        filterCodes();
    } catch (error) {
        container.innerHTML = '<div class="empty-text">加载失败</div>';
    }
}

// 筛选激活码
function filterCodes() {
    const showUnused = document.getElementById('filterUnused').checked;
    const showUsed = document.getElementById('filterUsed').checked;
    
    const filtered = adminCodesData.filter(code => {
        if (code.used_by) return showUsed;
        return showUnused;
    });
    
    renderCodesList(filtered);
}

// 渲染激活码列表
function renderCodesList(codes) {
    const container = document.getElementById('codesListContainer');
    const statsEl = document.getElementById('codesStats');
    
    if (codes.length === 0) {
        container.innerHTML = '<div class="empty-text">暂无激活码，点击上方生成</div>';
        if (statsEl) statsEl.innerHTML = '';
        return;
    }
    
    // 统计
    const unusedCount = codes.filter(c => !c.used_by).length;
    const usedCount = codes.filter(c => c.used_by).length;
    if (statsEl) {
        statsEl.innerHTML = `<span>✓ 可用 ${unusedCount}</span><span>✗ 已用 ${usedCount}</span><span>共 ${codes.length} 个</span>`;
    }
    
    container.innerHTML = codes.map(code => {
        const isUsed = !!code.used_by;
        const levelClass = code.level === 'svip' ? 'svip' : 'vip';
        const levelName = code.level === 'svip' ? 'SVIP' : 'VIP';
        
        let metaText = '';
        if (isUsed) {
            metaText = `被 ${code.used_by} 使用`;
        } else if (code.expires_at) {
            const expDate = new Date(code.expires_at);
            const now = new Date();
            const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            metaText = daysLeft > 0 ? `${daysLeft} 天后过期` : '已过期';
        } else {
            metaText = '永久有效';
        }
        
        return `
            <div class="code-item ${isUsed ? 'used' : ''}">
                <div class="code-info">
                    <span class="code-value">${code.code}</span>
                    <span class="code-level-badge ${levelClass}">${levelName}</span>
                    <span class="code-meta">${metaText}</span>
                </div>
                <div class="code-actions">
                    <button class="btn-copy-sm" onclick="copyCode('${code.code}')">复制</button>
                    ${!isUsed ? `<button class="btn-delete" onclick="deleteCode('${code.code}')">删除</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// 生成激活码
async function generateCodes() {
    const count = parseInt(document.getElementById('codeCount').value) || 10;
    const level = document.getElementById('codeLevel').value;
    const days = parseInt(document.getElementById('codeDays').value) || 30;
    
    try {
        const data = await api('/admin/codes/generate', { 
            method: 'POST', 
            body: JSON.stringify({ count, level, days }) 
        });
        const codes = data.codes || [];
        
        // 显示新生成的激活码
        const area = document.getElementById('newCodesArea');
        const list = document.getElementById('newCodesList');
        
        list.innerHTML = codes.map(code => 
            `<span class="new-code-item" onclick="copyCode('${code}')" title="点击复制">${code}</span>`
        ).join('');
        
        area.style.display = 'block';
        showToast(`✓ 已生成 ${codes.length} 个激活码`, 'success');
        
        // 刷新列表
        loadAdminCodes();
    } catch (error) {
        showToast('生成失败: ' + error.message, 'error');
    }
}

// 复制激活码
function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        showToast('✓ 已复制: ' + code, 'success');
    });
}

// 复制全部激活码
function copyAllCodes() {
    const list = document.getElementById('newCodesList');
    const codes = Array.from(list.querySelectorAll('.new-code-item')).map(el => el.textContent);
    navigator.clipboard.writeText(codes.join('\n')).then(() => {
        showToast(`✓ 已复制 ${codes.length} 个激活码`, 'success');
    });
}

// 删除激活码
async function deleteCode(code) {
    if (!confirm(`确定删除激活码 ${code}？`)) return;
    
    try {
        await api(`/admin/codes/${code}`, { method: 'DELETE' });
        showToast('✓ 已删除', 'success');
        loadAdminCodes();
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

// 加载用户列表
async function loadAdminUsers() {
    const container = document.getElementById('usersListContainer');
    container.innerHTML = '<div class="loading-text">加载中...</div>';
    
    try {
        const data = await api('/admin/users');
        adminUsersData = data.users || [];
        renderUsersList(adminUsersData);
    } catch (error) {
        container.innerHTML = '<div class="empty-text">加载失败</div>';
    }
}

// 渲染用户列表
function renderUsersList(users) {
    const container = document.getElementById('usersListContainer');
    const countEl = document.getElementById('usersCount');
    
    if (countEl) {
        countEl.textContent = `共 ${users.length} 人`;
    }
    
    if (users.length === 0) {
        container.innerHTML = '<div class="empty-text">暂无注册用户</div>';
        return;
    }
    
    const levelNames = { basic: '普通用户', vip: 'VIP', svip: 'SVIP' };
    
    container.innerHTML = users.map(user => {
        const levelName = levelNames[user.level] || user.level;
        const regDate = new Date(user.created_at).toLocaleDateString();
        
        let metaParts = [`注册于 ${regDate}`];
        if (user.level !== 'basic' && user.level_expires_at) {
            const expDate = new Date(user.level_expires_at);
            const now = new Date();
            const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            if (daysLeft > 0) {
                metaParts.push(`会员 ${daysLeft} 天后到期`);
            } else {
                metaParts.push('会员已过期');
            }
        }
        
        // 今日 AI 使用
        if (user.ai_used_today !== undefined) {
            metaParts.push(`今日 AI: ${user.ai_used_today} 次`);
        }
        
        return `
            <div class="user-item">
                <div class="user-info">
                    <span class="user-name">${user.username}</span>
                    <span class="user-meta">${metaParts.join(' · ')}</span>
                </div>
                <span class="user-level ${user.level}">${levelName}</span>
            </div>
        `;
    }).join('');
}

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    await checkMemberStatus();
    await loadTree();
    setupEventListeners();
    
    // SEO: 自动加载指定文档
    if (window.AUTO_LOAD_DOC_ID) {
        if (window.AUTO_LOAD_DOC_ID === '__about__') {
            showAboutPage();
        } else {
            selectNode(window.AUTO_LOAD_DOC_ID);
        }
    }
    
    // 管理员入口: 自动弹出登录框
    if (window.AUTO_SHOW_LOGIN && !isAdmin) {
        showLoginDialog();
    }
});

function setupEventListeners() {
    // 搜索框
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', handleSearch);
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim()) {
            document.getElementById('searchResults').classList.remove('hidden');
        }
    });
    
    // 点击其他地方关闭菜单和搜索结果
    document.addEventListener('click', (e) => {
        // 关闭右键菜单
        if (!e.target.closest('.context-menu')) {
            document.getElementById('contextMenu').classList.add('hidden');
        }
        // 关闭搜索结果
        if (!e.target.closest('.search-box') && !e.target.closest('.search-results')) {
            document.getElementById('searchResults').classList.add('hidden');
        }
    });
    
    // 键盘事件
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDialog();
            closeLoginDialog();
            document.getElementById('contextMenu').classList.add('hidden');
            document.getElementById('searchResults').classList.add('hidden');
            // 关闭抽屉
            document.getElementById('commentDrawer').classList.add('hidden');
            document.getElementById('aiDrawer').classList.add('hidden');
        }
        
        // Ctrl/Cmd + K 打开搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
    });
    
    // 对话框回车确认
    document.getElementById('nodeName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            confirmCreate();
        }
    });
}

// ============================================================
// API 调用
// ============================================================
async function api(endpoint, options = {}) {
    const response = await fetch(`/api${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(error.detail || '请求失败');
    }
    
    return response.json();
}

// ============================================================
// 目录树操作
// ============================================================
async function loadTree() {
    try {
        treeData = await api('/tree');
        renderTree();
        return treeData;
    } catch (error) {
        console.error('加载目录树失败:', error);
        return [];
    }
}

function renderTree() {
    const container = document.getElementById('treeView');
    
    if (treeData.length === 0) {
        container.innerHTML = `
            <div class="tree-empty">
                <p>暂无文档</p>
                <p style="font-size: 12px; margin-top: 8px;">点击上方按钮创建文件夹或文档</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = renderTreeNodes(treeData);
}

function renderTreeNodes(nodes, level = 0, parentId = null) {
    return nodes.map((node, index) => {
        const hasChildren = node.children && node.children.length > 0;
        const hasContent = !!node.path;
        const isActive = currentNodeId === node.id;
        
        // 状态类名：有内容显示实心圆点，无内容显示空心圆点
        const stateClass = hasContent ? 'has-content' : 'no-content';
        
        // 管理员才能拖动
        const draggableAttr = isAdmin ? 'draggable="true"' : '';
        
        return `
            <div class="tree-node" data-id="${node.id}" data-parent="${parentId || ''}" data-index="${index}">
                <div class="tree-node-content ${isActive ? 'active' : ''}" 
                     style="padding-left: ${16 + level * 20}px"
                     ${draggableAttr}
                     onclick="selectNodeMobile('${node.id}')"
                     oncontextmenu="showContextMenu(event, '${node.id}')"
                     ondragstart="handleDragStart(event, '${node.id}')"
                     ondragover="handleDragOver(event, '${node.id}')"
                     ondragleave="handleDragLeave(event)"
                     ondrop="handleDrop(event, '${node.id}')">
                    <span class="tree-toggle ${hasChildren ? '' : 'hidden'} ${hasChildren ? 'expanded' : ''}"
                          onclick="event.stopPropagation(); toggleFolder('${node.id}')">▶</span>
                    <span class="tree-dot ${stateClass}"></span>
                    <span class="tree-node-name">${escapeHtml(node.name)}</span>
                </div>
                ${hasChildren ? `
                    <div class="tree-children" id="children-${node.id}">
                        ${renderTreeNodes(node.children, level + 1, node.id)}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// ============================================================
// 拖放排序
// ============================================================
let draggedNodeId = null;
let dropTargetId = null;
let dropPosition = null; // 'before', 'after', 'inside'

function handleDragStart(event, nodeId) {
    if (!isAdmin) {
        event.preventDefault();
        return;
    }
    draggedNodeId = nodeId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    
    // 添加拖动样式
    setTimeout(() => {
        event.target.closest('.tree-node')?.classList.add('dragging');
    }, 0);
}

function handleDragOver(event, nodeId) {
    if (!isAdmin || !draggedNodeId || draggedNodeId === nodeId) return;
    
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const target = event.target.closest('.tree-node-content');
    if (!target) return;
    
    // 清除其他节点的拖放样式
    document.querySelectorAll('.tree-node-content').forEach(el => {
        el.classList.remove('drop-above', 'drop-below', 'drop-inside');
    });
    
    // 判断拖放位置
    const rect = target.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height;
    
    if (y < height * 0.25) {
        // 上方 - 放到目标前面
        dropPosition = 'before';
        target.classList.add('drop-above');
    } else if (y > height * 0.75) {
        // 下方 - 放到目标后面
        dropPosition = 'after';
        target.classList.add('drop-below');
    } else {
        // 中间 - 放到目标内部（作为子节点）
        dropPosition = 'inside';
        target.classList.add('drop-inside');
    }
    
    dropTargetId = nodeId;
}

function handleDragLeave(event) {
    const target = event.target.closest('.tree-node-content');
    if (target) {
        target.classList.remove('drop-above', 'drop-below', 'drop-inside');
    }
}

async function handleDrop(event, nodeId) {
    event.preventDefault();
    
    // 清除所有拖放样式
    document.querySelectorAll('.tree-node').forEach(el => {
        el.classList.remove('dragging');
    });
    document.querySelectorAll('.tree-node-content').forEach(el => {
        el.classList.remove('drop-above', 'drop-below', 'drop-inside');
    });
    
    if (!isAdmin || !draggedNodeId || !dropTargetId || draggedNodeId === dropTargetId) {
        draggedNodeId = null;
        dropTargetId = null;
        dropPosition = null;
        return;
    }
    
    // 检查是否将节点拖到自己的子节点中（防止循环）
    if (isDescendant(draggedNodeId, dropTargetId)) {
        showToast('不能将节点移动到自己的子节点中', 'error');
        draggedNodeId = null;
        dropTargetId = null;
        dropPosition = null;
        return;
    }
    
    try {
        await api('/tree/move', {
            method: 'POST',
            body: JSON.stringify({
                node_id: draggedNodeId,
                target_id: dropTargetId,
                position: dropPosition
            })
        });
        
        showToast('✓ 移动成功', 'success');
        await loadTree();
    } catch (error) {
        showToast('移动失败: ' + error.message, 'error');
    }
    
    draggedNodeId = null;
    dropTargetId = null;
    dropPosition = null;
}

// 检查 nodeId 是否是 targetId 的祖先节点
function isDescendant(ancestorId, descendantId) {
    function findInChildren(nodes, targetId, ancestorFound) {
        for (const node of nodes) {
            if (node.id === ancestorId) {
                ancestorFound = true;
            }
            if (ancestorFound && node.id === descendantId) {
                return true;
            }
            if (node.children && findInChildren(node.children, targetId, ancestorFound)) {
                return true;
            }
        }
        return false;
    }
    return findInChildren(treeData, descendantId, false);
}

// 拖动结束时清除样式
document.addEventListener('dragend', () => {
    document.querySelectorAll('.tree-node').forEach(el => {
        el.classList.remove('dragging');
    });
    document.querySelectorAll('.tree-node-content').forEach(el => {
        el.classList.remove('drop-above', 'drop-below', 'drop-inside');
    });
    draggedNodeId = null;
});

function toggleFolder(nodeId) {
    const childrenEl = document.getElementById(`children-${nodeId}`);
    const toggleEl = document.querySelector(`[data-id="${nodeId}"] .tree-toggle`);
    
    if (childrenEl) {
        childrenEl.classList.toggle('collapsed');
        toggleEl.classList.toggle('expanded');
    }
}

function selectNode(nodeId) {
    currentNodeId = nodeId;
    
    // 更新激活状态
    document.querySelectorAll('.tree-node-content').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelector(`[data-id="${nodeId}"] > .tree-node-content`)?.classList.add('active');
    
    // 查找节点
    const node = findNodeById(treeData, nodeId);
    if (!node) return;
    
    // 加载文档内容（每个节点都可以有内容）
    loadDocument(nodeId);
    
    // 只有管理员才显示上传按钮
    if (isAdmin) {
        document.getElementById('uploadBtn').style.display = 'flex';
        document.getElementById('uploadImageBtn').style.display = 'flex';
    }
    
    // 如果有子节点，确保展开
    if (node.children && node.children.length > 0) {
        const childrenEl = document.getElementById(`children-${nodeId}`);
        if (childrenEl && childrenEl.classList.contains('collapsed')) {
            toggleFolder(nodeId);
        }
    }
    
    // 更新浏览器 URL（不刷新页面）
    if (history.pushState && !window.AUTO_LOAD_DOC_ID) {
        const newUrl = `/doc/${nodeId}`;
        history.pushState({ docId: nodeId }, node.name, newUrl);
    }
    // 清除自动加载标记
    window.AUTO_LOAD_DOC_ID = null;
}

// 处理浏览器前进/后退
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.docId) {
        selectNode(event.state.docId);
    } else {
        // 返回首页
        currentNodeId = null;
        document.querySelectorAll('.tree-node-content').forEach(el => {
            el.classList.remove('active');
        });
        showWelcomeScreen();
    }
});

function findNodeById(nodes, id) {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

// ============================================================
// 文档操作
// ============================================================
async function loadDocument(nodeId) {
    try {
        const doc = await api(`/doc/${nodeId}`);
        const container = document.getElementById('documentContent');
        
        // 更新面包屑
        document.getElementById('breadcrumb').innerHTML = `
            <span class="breadcrumb-item">📄 ${escapeHtml(doc.name)}</span>
        `;
        
        // 更新 AI 上下文
        currentDocName = doc.name;
        currentDocContent = doc.content || '';
        updateAIContext();
        
        // 更新评论区文档名称
        updateCommentDocName(doc.name);
        
        if (doc.empty) {
            currentDocContent = '';
            container.innerHTML = `
                <div class="empty-upload">
                    <div class="empty-upload-icon">📤</div>
                    <h3>尚未上传文件</h3>
                    <p>请上传一个 Markdown (.md) 文件</p>
                    <button class="btn btn-primary" onclick="triggerUpload()">
                        📤 上传文件
                    </button>
                </div>
            `;
            updateCommentCount(0);
            hideTOC();
        } else {
            // 文章元信息
            const metaHtml = renderDocMeta(doc);
            container.innerHTML = `
                ${metaHtml}
                <div class="markdown-body">${doc.html}</div>
            `;
            // 加载评论
            loadComments(nodeId);
            // 生成目录
            generateTOC();
        }
    } catch (error) {
        console.error('加载文档失败:', error);
        currentDocContent = '';
        currentDocName = '';
        updateAIContext();
        document.getElementById('documentContent').innerHTML = `
            <div class="empty-upload">
                <div class="empty-upload-icon">❌</div>
                <h3>加载失败</h3>
                <p>${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

// ============================================================
// 添加菜单
// ============================================================
function initAddMenu() {
    const btn = document.getElementById('addMenuBtn');
    const menu = document.getElementById('addMenu');
    
    if (!btn || !menu) return;
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
    });
    
    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
        menu.classList.remove('show');
    });
}

function hideAddMenu() {
    const menu = document.getElementById('addMenu');
    if (menu) menu.classList.remove('show');
}

// ============================================================
// 创建节点
// ============================================================
function createRootDoc() {
    showCreateDialog('新建文档', null);
}

function showCreateDialog(title, parentId) {
    pendingAction = { parentId, action: 'create' };
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('nodeName').value = '';
    document.getElementById('nodeName').placeholder = '文档名称';
    document.getElementById('createDialog').classList.remove('hidden');
    document.getElementById('nodeName').focus();
}

function closeDialog() {
    document.getElementById('createDialog').classList.add('hidden');
    pendingAction = null;
}

async function confirmCreate() {
    const name = document.getElementById('nodeName').value.trim();
    if (!name) {
        alert('请输入名称');
        return;
    }
    
    try {
        if (pendingAction.action === 'create') {
            await api('/node', {
                method: 'POST',
                body: JSON.stringify({
                    parent_id: pendingAction.parentId,
                    name: name
                })
            });
        } else if (pendingAction.action === 'rename') {
            await api('/node/rename', {
                method: 'PUT',
                body: JSON.stringify({
                    id: pendingAction.nodeId,
                    name: name
                })
            });
        }
        
        closeDialog();
        await loadTree();
        
        // 重新加载当前文档
        if (currentNodeId) {
            selectNode(currentNodeId);
        }
    } catch (error) {
        alert('操作失败: ' + error.message);
    }
}

// ============================================================
// 右键菜单
// ============================================================
function showContextMenu(event, nodeId) {
    event.preventDefault();
    event.stopPropagation();
    
    // 非管理员不显示右键菜单
    if (!isAdmin) {
        return;
    }
    
    contextNodeId = nodeId;
    const menu = document.getElementById('contextMenu');
    
    // 定位菜单
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.classList.remove('hidden');
    
    // 确保菜单不超出屏幕
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
    }
}

async function contextAction(action) {
    document.getElementById('contextMenu').classList.add('hidden');
    
    const node = findNodeById(treeData, contextNodeId);
    if (!node) return;
    
    switch (action) {
        case 'addChild':
            showCreateDialog('新建子文档', contextNodeId);
            break;
        
        case 'addChildAI':
            showAIGenerateDialog(contextNodeId, node.name);
            break;
            
        case 'rename':
            pendingAction = { action: 'rename', nodeId: contextNodeId };
            document.getElementById('dialogTitle').textContent = '重命名';
            document.getElementById('nodeName').value = node.name;
            document.getElementById('createDialog').classList.remove('hidden');
            document.getElementById('nodeName').focus();
            document.getElementById('nodeName').select();
            break;
            
        case 'delete':
            const hasChildren = node.children && node.children.length > 0;
            if (confirm(`确定要删除 "${node.name}" 吗？${hasChildren ? '\n注意：这将同时删除所有子文档！' : ''}`)) {
                try {
                    await api(`/node/${contextNodeId}`, { method: 'DELETE' });
                    if (currentNodeId === contextNodeId) {
                        currentNodeId = null;
                        showWelcomeScreen();
                        document.getElementById('uploadBtn').style.display = 'none';
                    }
                    await loadTree();
                } catch (error) {
                    alert('删除失败: ' + error.message);
                }
            }
            break;
    }
}

// ============================================================
// 文件上传
// ============================================================
function triggerUpload() {
    if (!currentNodeId) {
        alert('请先选择一个文档节点');
        return;
    }
    document.getElementById('fileInput').click();
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.md')) {
        alert('只支持 .md 文件');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        await fetch(`/api/upload/${currentNodeId}`, {
            method: 'POST',
            body: formData
        });
        
        // 重新加载文档
        await loadTree();
        await loadDocument(currentNodeId);
    } catch (error) {
        alert('上传失败: ' + error.message);
    }
    
    // 清空 input
    event.target.value = '';
}

// ============================================================
// 图片上传
// ============================================================
function triggerImageUpload() {
    document.getElementById('imageInput').click();
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 检查是否是图片
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
    }
    
    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload/image', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '上传失败');
        }
        
        const data = await response.json();
        
        // 复制 Markdown 格式的图片链接到剪贴板
        const markdownLink = `![${file.name}](${data.url})`;
        
        try {
            await navigator.clipboard.writeText(markdownLink);
            showToast('图片已上传，Markdown 链接已复制', 'success');
        } catch (e) {
            // 如果剪贴板不可用，显示链接让用户手动复制
            prompt('图片上传成功！复制以下 Markdown 链接：', markdownLink);
        }
        
    } catch (error) {
        alert('上传失败: ' + error.message);
    }
    
    // 清空 input
    event.target.value = '';
}

// ============================================================
// 搜索
// ============================================================
function handleSearch(event) {
    const query = event.target.value.trim();
    
    // 防抖
    clearTimeout(searchTimeout);
    
    if (!query) {
        document.getElementById('searchResults').classList.add('hidden');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const data = await api(`/search?q=${encodeURIComponent(query)}`);
            renderSearchResults(data.results);
        } catch (error) {
            console.error('搜索失败:', error);
        }
    }, 300);
}

function renderSearchResults(results) {
    const container = document.getElementById('searchResults');
    
    if (results.length === 0) {
        container.innerHTML = '<div class="search-no-result">未找到相关文档</div>';
    } else {
        container.innerHTML = results.map(result => `
            <div class="search-result-item" onclick="selectNode('${result.id}'); document.getElementById('searchResults').classList.add('hidden');">
                <div class="search-result-title">📄 ${escapeHtml(result.name)}</div>
                <div class="search-result-snippet">${escapeHtml(result.snippet)}</div>
            </div>
        `).join('');
    }
    
    container.classList.remove('hidden');
}

// ============================================================
// 评论功能
// ============================================================
let commentCount = 0;

function toggleCommentDrawer() {
    const drawer = document.getElementById('commentDrawer');
    drawer.classList.toggle('hidden');
    
    // 如果打开抽屉，恢复保存的昵称
    if (!drawer.classList.contains('hidden')) {
        const savedAuthor = localStorage.getItem('knowhub_author') || '';
        const authorInput = document.getElementById('commentAuthor');
        if (authorInput && !authorInput.value) {
            authorInput.value = savedAuthor;
        }
    }
}

async function loadComments(docId) {
    if (!docId) {
        updateCommentCount(0);
        return;
    }
    
    try {
        const data = await api(`/comments/${docId}`);
        renderComments(data.comments, data.total);
        updateCommentCount(data.total);
    } catch (error) {
        console.error('加载评论失败:', error);
        updateCommentCount(0);
    }
}

function updateCommentCount(count) {
    commentCount = count;
    
    // 更新浮动按钮上的数字
    const fabCount = document.getElementById('commentFabCount');
    if (fabCount) {
        fabCount.textContent = count > 0 ? count : '';
    }
    
    // 更新抽屉标题上的数字
    const drawerCount = document.getElementById('commentDrawerCount');
    if (drawerCount) {
        drawerCount.textContent = count > 0 ? `(${count})` : '';
    }
}

function updateCommentDocName(name) {
    const docNameEl = document.querySelector('#commentDocName .doc-name');
    if (docNameEl) {
        docNameEl.textContent = name || '未选择文档';
    }
}

function renderComments(comments, total) {
    const container = document.getElementById('commentsContainer');
    if (!container) return;
    
    const listHtml = comments.length > 0 
        ? comments.map(c => `
            <div class="comment-item" data-id="${c.id}">
                <div class="comment-header">
                    <div class="comment-author">
                        <div class="comment-avatar">${escapeHtml(c.author.charAt(0).toUpperCase())}</div>
                        <span class="comment-name">${escapeHtml(c.author)}</span>
                    </div>
                    <span class="comment-time">${formatTime(c.created_at)}</span>
                </div>
                <div class="comment-content">${escapeHtml(c.content)}</div>
            </div>
        `).join('')
        : `
            <div class="comments-empty">
                <div class="comments-empty-icon">💬</div>
                <p>暂无评论，来发表第一条吧！</p>
            </div>
        `;
    
    container.innerHTML = listHtml;
}

async function submitComment() {
    if (!currentNodeId) {
        alert('请先选择一个文档');
        return;
    }
    
    const authorInput = document.getElementById('commentAuthor');
    const contentInput = document.getElementById('commentContent');
    
    const author = authorInput.value.trim();
    const content = contentInput.value.trim();
    
    if (!author) {
        alert('请输入昵称');
        authorInput.focus();
        return;
    }
    
    if (!content) {
        alert('请输入评论内容');
        contentInput.focus();
        return;
    }
    
    try {
        await api('/comments', {
            method: 'POST',
            body: JSON.stringify({
                doc_id: currentNodeId,
                author: author,
                content: content
            })
        });
        
        // 清空输入框
        contentInput.value = '';
        // 保留昵称方便下次使用
        localStorage.setItem('knowhub_author', author);
        
        // 重新加载评论
        await loadComments(currentNodeId);
    } catch (error) {
        alert('发表评论失败: ' + error.message);
    }
}

function formatTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    
    // 1分钟内
    if (diff < 60 * 1000) {
        return '刚刚';
    }
    // 1小时内
    if (diff < 60 * 60 * 1000) {
        return Math.floor(diff / (60 * 1000)) + ' 分钟前';
    }
    // 24小时内
    if (diff < 24 * 60 * 60 * 1000) {
        return Math.floor(diff / (60 * 60 * 1000)) + ' 小时前';
    }
    // 超过24小时显示日期
    return date.toLocaleDateString('zh-CN', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================================
// AI 对话功能
// ============================================================
let currentDocContent = '';
let currentDocName = '';

function toggleAIDrawer() {
    const drawer = document.getElementById('aiDrawer');
    drawer.classList.toggle('hidden');
    
    // 更新上下文显示
    updateAIContext();
}

function updateAIContext() {
    const contextName = document.getElementById('aiContextName');
    if (currentDocName) {
        contextName.textContent = currentDocName;
    } else {
        contextName.textContent = '未选择文档';
    }
}

let currentMemberUser = null;

async function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // 添加用户消息
    addAIMessage(message, 'user');
    input.value = '';
    
    // 创建 AI 回复消息容器（用于流式更新）
    const messageId = createStreamingMessage();
    
    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                context: currentDocContent,
                doc_name: currentDocName
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            if (response.status === 429) {
                // 次数用完或无权限，提示升级会员
                const tip = currentMemberUser 
                    ? (currentMemberUser.level === 'basic' ? '升级 VIP 会员即可使用 AI 助手！' : '今日次数已用完，明天再来~')
                    : '成为 VIP 会员即可使用 AI 助手！';
                updateStreamingMessage(messageId, `⚠️ ${error.detail}\n\n${tip}`);
                return;
            }
            throw new Error(error.detail || '请求失败');
        }
        
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') {
                        // 流结束
                        break;
                    }
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.content) {
                            fullContent += data.content;
                            updateStreamingMessage(messageId, fullContent);
                        }
                        if (data.error) {
                            updateStreamingMessage(messageId, `⚠️ ${data.error}`);
                        }
                    } catch (e) {
                        // JSON 解析错误，忽略
                    }
                }
            }
        }
        
        // 完成流式更新，最终渲染
        finalizeStreamingMessage(messageId, fullContent);
        
        // 更新 AI 状态
        updateAIStatus();
    } catch (error) {
        updateStreamingMessage(messageId, `⚠️ ${error.message || 'AI 服务暂时不可用，请稍后再试'}`);
    }
}

// 创建流式消息容器
function createStreamingMessage() {
    const container = document.getElementById('aiMessages');
    const id = 'stream-' + Date.now();
    const messageDiv = document.createElement('div');
    messageDiv.id = id;
    messageDiv.className = 'ai-message ai-message-assistant';
    messageDiv.innerHTML = `
        <div class="ai-message-content ai-streaming">
            <span class="ai-cursor"></span>
        </div>
    `;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    return id;
}

// 更新流式消息内容
function updateStreamingMessage(id, content) {
    const messageDiv = document.getElementById(id);
    if (messageDiv) {
        const contentDiv = messageDiv.querySelector('.ai-message-content');
        contentDiv.innerHTML = escapeHtml(content).replace(/\n/g, '<br>') + '<span class="ai-cursor"></span>';
        const container = document.getElementById('aiMessages');
        container.scrollTop = container.scrollHeight;
    }
}

// 完成流式消息（移除光标，渲染 Markdown）
function finalizeStreamingMessage(id, content) {
    const messageDiv = document.getElementById(id);
    if (messageDiv) {
        const contentDiv = messageDiv.querySelector('.ai-message-content');
        contentDiv.classList.remove('ai-streaming');
        // 简单渲染：换行和代码块
        let html = escapeHtml(content);
        // 处理代码块
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        // 处理行内代码
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // 处理换行
        html = html.replace(/\n/g, '<br>');
        contentDiv.innerHTML = html;
    }
}

// ============================================================
// 会员系统
// ============================================================
async function checkMemberStatus() {
    try {
        const data = await api('/auth/me');
        if (data.logged_in && !data.is_admin) {
            currentMemberUser = data;
        } else {
            currentMemberUser = null;
        }
        updateMemberUI();
    } catch (e) {
        currentMemberUser = null;
    }
}

function updateMemberUI() {
    // 更新 AI 抽屉中的用户状态
    updateAIStatus();
    
    // 更新复制权限
    updateCopyPermission();
    
    // 更新登录/注册按钮显示
    const actionsEl = document.getElementById('aiUserActions');
    if (actionsEl) {
        if (currentMemberUser) {
            const isVip = currentMemberUser.level === 'vip' || currentMemberUser.level === 'svip';
            actionsEl.innerHTML = `
                <span style="font-size: 12px; color: var(--text-muted);">${currentMemberUser.username}</span>
                ${!isVip ? '<button class="btn btn-sm btn-primary" onclick="showActivateDialog()">升级</button>' : ''}
                <button class="btn btn-sm btn-secondary" onclick="doUserLogout()">退出</button>
            `;
        } else {
            actionsEl.innerHTML = `
                <button class="btn btn-sm btn-secondary" onclick="showUserLoginDialog()">登录</button>
                <button class="btn btn-sm btn-primary" onclick="showUserRegisterDialog()">注册</button>
            `;
        }
    }
}

// ============================================================
// 复制保护
// ============================================================
function updateCopyPermission() {
    const docContent = document.getElementById('documentContent');
    if (!docContent) return;
    
    // 会员或管理员可以复制
    if (currentMemberUser || isAdmin) {
        docContent.classList.remove('no-copy');
        document.body.classList.remove('no-copy');
    } else {
        docContent.classList.add('no-copy');
        document.body.classList.add('no-copy');
    }
}

// 禁止非会员复制
document.addEventListener('copy', (e) => {
    if (document.body.classList.contains('no-copy')) {
        // 检查是否在代码块中
        const selection = window.getSelection();
        const anchorNode = selection.anchorNode;
        if (anchorNode) {
            const parent = anchorNode.parentElement;
            if (parent && (parent.closest('pre') || parent.closest('code'))) {
                // 允许复制代码
                return;
            }
        }
        
        e.preventDefault();
        showToast('登录后即可复制内容', 'info');
    }
});

// 禁止右键菜单（可选）
document.addEventListener('contextmenu', (e) => {
    if (document.body.classList.contains('no-copy')) {
        const target = e.target;
        // 允许在代码块中右键
        if (target.closest('pre') || target.closest('code')) {
            return;
        }
        // 如果是在文档内容区域
        if (target.closest('.markdown-body')) {
            e.preventDefault();
            showToast('登录后即可复制内容', 'info');
        }
    }
});

async function updateAIStatus() {
    try {
        const data = await api('/user/ai-status');
        const statusEl = document.getElementById('aiUserStatus');
        if (statusEl) {
            // 管理员显示无限
            const limitText = data.daily_limit === -1 ? '∞' : data.daily_limit;
            statusEl.innerHTML = `
                <span class="ai-status-level">${data.level_name}</span>
                <span class="ai-status-count">今日: ${data.used_today}/${limitText}</span>
            `;
        }
    } catch (e) {
        console.error('获取 AI 状态失败', e);
    }
}

async function showUserLoginDialog() {
    document.getElementById('userLoginDialog').classList.remove('hidden');
    document.getElementById('userLoginUsername').focus();
}

function closeUserLoginDialog() {
    document.getElementById('userLoginDialog').classList.add('hidden');
    document.getElementById('userLoginUsername').value = '';
    document.getElementById('userLoginPassword').value = '';
    document.getElementById('userLoginError').textContent = '';
}

async function showUserRegisterDialog() {
    document.getElementById('userRegisterDialog').classList.remove('hidden');
    document.getElementById('userRegUsername').focus();
}

function closeUserRegisterDialog() {
    document.getElementById('userRegisterDialog').classList.add('hidden');
    document.getElementById('userRegUsername').value = '';
    document.getElementById('userRegPassword').value = '';
    document.getElementById('userRegEmail').value = '';
    document.getElementById('userRegError').textContent = '';
}

async function doUserLogin() {
    const username = document.getElementById('userLoginUsername').value.trim();
    const password = document.getElementById('userLoginPassword').value;
    const errorEl = document.getElementById('userLoginError');
    
    if (!username || !password) {
        errorEl.textContent = '请输入用户名和密码';
        return;
    }
    
    try {
        const data = await api('/user/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        closeUserLoginDialog();
        currentMemberUser = data;
        updateMemberUI();
        alert(`欢迎回来，${data.username}！\n会员等级: ${data.level_name}\n今日 AI 次数: ${data.ai_limit - data.ai_used_today}/${data.ai_limit}`);
    } catch (error) {
        errorEl.textContent = error.message || '登录失败';
    }
}

async function doUserRegister() {
    const username = document.getElementById('userRegUsername').value.trim();
    const password = document.getElementById('userRegPassword').value;
    const email = document.getElementById('userRegEmail').value.trim();
    const errorEl = document.getElementById('userRegError');
    
    if (!username || !password) {
        errorEl.textContent = '请输入用户名和密码';
        return;
    }
    
    try {
        const data = await api('/user/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, email })
        });
        closeUserRegisterDialog();
        currentMemberUser = data;
        updateMemberUI();
        alert(`注册成功！欢迎，${data.username}！\n会员等级: ${data.level_name}\n每日 AI 次数: ${data.ai_limit}`);
    } catch (error) {
        errorEl.textContent = error.message || '注册失败';
    }
}

async function doUserLogout() {
    try {
        await api('/user/logout', { method: 'POST' });
    } catch (e) {}
    currentMemberUser = null;
    updateMemberUI();
}

// ============================================================
// 激活码功能
// ============================================================
function showActivateDialog() {
    if (!currentMemberUser) {
        showToast('请先登录', 'info');
        showUserLoginDialog();
        return;
    }
    document.getElementById('activateCodeDialog').classList.remove('hidden');
    document.getElementById('activateCodeInput').focus();
}

function closeActivateDialog() {
    document.getElementById('activateCodeDialog').classList.add('hidden');
    document.getElementById('activateCodeInput').value = '';
    document.getElementById('activateError').textContent = '';
}

async function doActivateCode() {
    const code = document.getElementById('activateCodeInput').value.trim();
    const errorEl = document.getElementById('activateError');
    
    if (!code) {
        errorEl.textContent = '请输入激活码';
        return;
    }
    
    try {
        const data = await api('/user/activate', {
            method: 'POST',
            body: JSON.stringify({ code })
        });
        
        closeActivateDialog();
        showToast(`激活成功！已升级为${data.level_name}，有效期至 ${data.expire_date}`, 'success', 4000);
        
        // 刷新用户状态
        await checkMemberStatus();
    } catch (error) {
        errorEl.textContent = error.message || '激活失败';
    }
}

// 激活码输入框回车
document.addEventListener('DOMContentLoaded', () => {
    const codeInput = document.getElementById('activateCodeInput');
    if (codeInput) {
        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doActivateCode();
        });
        // 自动格式化激活码
        codeInput.addEventListener('input', (e) => {
            let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            let formatted = '';
            for (let i = 0; i < value.length && i < 16; i++) {
                if (i > 0 && i % 4 === 0) formatted += '-';
                formatted += value[i];
            }
            e.target.value = formatted;
        });
    }
});

function addAIMessage(content, role) {
    const container = document.getElementById('aiMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ai-message-${role}`;
    messageDiv.innerHTML = `<div class="ai-message-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

function addAILoading() {
    const container = document.getElementById('aiMessages');
    const id = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = id;
    loadingDiv.className = 'ai-message ai-message-assistant';
    loadingDiv.innerHTML = `
        <div class="ai-message-loading">
            <span></span><span></span><span></span>
        </div>
    `;
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeAILoading(id) {
    const loadingDiv = document.getElementById(id);
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// 键盘事件：Enter 发送消息
document.addEventListener('DOMContentLoaded', () => {
    const aiInput = document.getElementById('aiInput');
    if (aiInput) {
        aiInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAIMessage();
            }
        });
    }
});

// ============================================================
// 认证功能
// ============================================================
async function checkAuthStatus() {
    try {
        const data = await api('/auth/me');
        isAdmin = data.is_admin;
        currentUser = data.username;
        updateAuthUI();
    } catch (error) {
        isAdmin = false;
        currentUser = null;
        updateAuthUI();
    }
}

function updateAuthUI() {
    const userStatus = document.getElementById('userStatus');
    const adminElements = document.querySelectorAll('.admin-only');
    
    if (isAdmin && currentUser) {
        // 已登录状态 - 显示管理员信息
        userStatus.innerHTML = `
            <div class="user-info">
                <span class="user-badge">管理员</span>
            </div>
            <button class="btn-logout" onclick="doLogout()">退出</button>
        `;
        // 显示管理员功能
        adminElements.forEach(el => {
            el.style.display = '';
        });
    } else {
        // 未登录状态 - 隐藏管理员功能
        adminElements.forEach(el => {
            el.style.display = 'none';
        });
    }
    
    // 重新渲染树（更新右键菜单）
    renderTree();
}

function showLoginDialog() {
    document.getElementById('loginDialog').classList.remove('hidden');
    document.getElementById('loginUsername').focus();
    document.getElementById('loginError').textContent = '';
}

function closeLoginDialog() {
    document.getElementById('loginDialog').classList.add('hidden');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').textContent = '';
}

async function doLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    if (!username || !password) {
        errorEl.textContent = '请输入用户名和密码';
        return;
    }
    
    try {
        await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        closeLoginDialog();
        await checkAuthStatus();
    } catch (error) {
        errorEl.textContent = error.message || '登录失败';
    }
}

async function doLogout() {
    try {
        await api('/auth/logout', { method: 'POST' });
    } catch (error) {
        // 忽略错误
    }
    isAdmin = false;
    currentUser = null;
    updateAuthUI();
}

// 登录框回车事件
document.addEventListener('DOMContentLoaded', () => {
    const loginPassword = document.getElementById('loginPassword');
    if (loginPassword) {
        loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                doLogin();
            }
        });
    }
    const loginUsername = document.getElementById('loginUsername');
    if (loginUsername) {
        loginUsername.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('loginPassword').focus();
            }
        });
    }
});

// ============================================================
// 文章元信息（阅读量、时间）
// ============================================================
function renderDocMeta(doc) {
    const views = doc.views || 0;
    const updatedAt = doc.updated_at;
    const createdAt = doc.created_at;
    
    let timeStr = '';
    if (updatedAt) {
        timeStr = formatDate(updatedAt);
    } else if (createdAt) {
        timeStr = formatDate(createdAt);
    }
    
    return `
        <div class="doc-meta">
            <div class="doc-meta-left">
                ${timeStr ? `<span class="doc-meta-item">📅 ${timeStr}</span>` : ''}
                <span class="doc-meta-item">👁️ ${views} 次阅读</span>
            </div>
            <div class="doc-meta-right">
                <button class="share-btn" onclick="shareDoc()" title="分享文章">
                    🔗 分享
                </button>
            </div>
        </div>
    `;
}

function shareDoc() {
    const url = window.location.href;
    const title = document.title;
    
    // 显示分享菜单
    showShareMenu(url, title);
}

function showShareMenu(url, title) {
    // 移除已有的菜单
    const existing = document.getElementById('shareMenu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.id = 'shareMenu';
    menu.className = 'share-menu';
    menu.innerHTML = `
        <div class="share-menu-content">
            <div class="share-menu-header">
                <span>分享文章</span>
                <button class="btn-close" onclick="closeShareMenu()">×</button>
            </div>
            <div class="share-menu-body">
                <button class="share-option" onclick="copyLink()">
                    📋 复制链接
                </button>
                <button class="share-option" onclick="shareToWeibo('${encodeURIComponent(title)}', '${encodeURIComponent(url)}')">
                    🔴 分享到微博
                </button>
                <button class="share-option" onclick="shareToTwitter('${encodeURIComponent(title)}', '${encodeURIComponent(url)}')">
                    🐦 分享到 Twitter
                </button>
            </div>
            <div class="share-menu-footer">
                <input type="text" value="${url}" readonly id="shareUrl" class="share-url-input">
            </div>
        </div>
    `;
    document.body.appendChild(menu);
    
    // 点击背景关闭
    menu.addEventListener('click', (e) => {
        if (e.target === menu) closeShareMenu();
    });
}

function closeShareMenu() {
    const menu = document.getElementById('shareMenu');
    if (menu) menu.remove();
}

function copyLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        closeShareMenu();
        showToast('链接已复制到剪贴板', 'success');
    }).catch(() => {
        // 降级方案
        const input = document.getElementById('shareUrl');
        if (input) {
            input.select();
            document.execCommand('copy');
            closeShareMenu();
            showToast('链接已复制到剪贴板', 'success');
        }
    });
}

function shareToWeibo(title, url) {
    window.open(`https://service.weibo.com/share/share.php?title=${title}&url=${url}`, '_blank');
    closeShareMenu();
}

function shareToTwitter(title, url) {
    window.open(`https://twitter.com/intent/tweet?text=${title}&url=${url}`, '_blank');
    closeShareMenu();
}

// ============================================================
// 关于页面
// ============================================================
function showAboutPage() {
    const container = document.getElementById('documentContent');
    const siteName = window.SITE_CONFIG?.name || 'KnowHub';
    const siteDesc = window.SITE_CONFIG?.description || '';
    const author = window.SITE_CONFIG?.author || '';
    const email = window.SITE_CONFIG?.email || '';
    
    // 清除当前选中状态
    currentNodeId = null;
    document.querySelectorAll('.tree-node-content').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById('uploadBtn').style.display = 'none';
    
    // 更新面包屑
    document.getElementById('breadcrumb').innerHTML = `
        <span class="breadcrumb-item">👤 关于</span>
    `;
    
    container.innerHTML = `
        <div class="about-page">
            <div class="about-header">
                <div class="about-avatar">📚</div>
                <h1>${siteName}</h1>
                <p class="about-desc">${siteDesc}</p>
            </div>
            <div class="about-content">
                <h2>👋 欢迎</h2>
                <p>这里记录技术笔记、开发经验、学习心得与各种有趣的探索。</p>
                
                <h2>📌 关于作者</h2>
                <p>作者：<strong>${author}</strong></p>
                ${email ? `<p>邮箱：<a href="mailto:${email}">${email}</a></p>` : ''}
                <p>如果你对文章内容有任何疑问或建议，欢迎留言或发邮件联系我。</p>
                
                <h2>🔗 订阅</h2>
                <p>你可以通过 <a href="/rss.xml" target="_blank">RSS 订阅</a> 来获取最新文章更新。</p>
                
                <h2>📊 统计</h2>
                <p id="aboutStats">加载中...</p>
            </div>
        </div>
    `;
    
    // 隐藏 TOC
    hideTOC();
    
    // 加载统计数据
    loadAboutStats();
}

async function loadAboutStats() {
    try {
        const tree = await api('/tree');
        
        // 统计文档数量
        function countDocs(nodes) {
            let count = 0;
            for (const node of nodes) {
                if (node.path) count++;
                if (node.children) count += countDocs(node.children);
            }
            return count;
        }
        
        const docCount = countDocs(tree);
        const statsEl = document.getElementById('aboutStats');
        if (statsEl) {
            statsEl.innerHTML = `共收录 <strong>${docCount}</strong> 篇文章`;
        }
    } catch (e) {
        console.error('加载统计失败', e);
    }
}

function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// ============================================================
// 文章目录 (TOC)
// ============================================================
function generateTOC() {
    const content = document.querySelector('.markdown-body');
    const tocNav = document.getElementById('tocNav');
    const tocSidebar = document.getElementById('tocSidebar');
    const container = document.getElementById('documentContent');
    
    if (!content || !tocNav || !tocSidebar) return;
    
    const headings = content.querySelectorAll('h1, h2, h3');
    
    // 如果标题少于 3 个，不显示目录
    if (headings.length < 3) {
        hideTOC();
        return;
    }
    
    // 生成目录 HTML
    let tocHtml = '';
    headings.forEach((heading, index) => {
        const id = `heading-${index}`;
        heading.id = id;
        const level = heading.tagName.toLowerCase();
        const text = heading.textContent.replace(/^[#\s]+/, '').trim();
        tocHtml += `<a class="toc-item toc-${level}" data-id="${id}" onclick="scrollToHeading('${id}')">${text}</a>`;
    });
    
    tocNav.innerHTML = tocHtml;
    tocSidebar.classList.add('visible');
    container.classList.add('has-toc');
    
    // 监听滚动，高亮当前位置
    setupTOCScroll();
}

function hideTOC() {
    const tocSidebar = document.getElementById('tocSidebar');
    const container = document.getElementById('documentContent');
    if (tocSidebar) tocSidebar.classList.remove('visible');
    if (container) container.classList.remove('has-toc');
}

function scrollToHeading(id) {
    const element = document.getElementById(id);
    if (element) {
        const offset = 80; // 顶部工具栏高度
        const top = element.getBoundingClientRect().top + window.scrollY - offset;
        document.querySelector('.document-content').scrollTo({
            top: top - 60,
            behavior: 'smooth'
        });
    }
}

function setupTOCScroll() {
    const container = document.querySelector('.document-content');
    const tocItems = document.querySelectorAll('.toc-item');
    
    if (!container) return;
    
    container.addEventListener('scroll', () => {
        // 更新 TOC 高亮
        if (tocItems.length > 0) {
            const headings = document.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3');
            let currentId = '';
            
            headings.forEach(heading => {
                const rect = heading.getBoundingClientRect();
                if (rect.top <= 150) {
                    currentId = heading.id;
                }
            });
            
            tocItems.forEach(item => {
                item.classList.toggle('active', item.dataset.id === currentId);
            });
        }
        
        // 显示/隐藏返回顶部按钮
        const backToTop = document.getElementById('backToTop');
        if (backToTop) {
            backToTop.classList.toggle('visible', container.scrollTop > 300);
        }
    });
}

function scrollToTop() {
    const container = document.querySelector('.document-content');
    if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ============================================================
// 移动端侧边栏
// ============================================================
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
    
    // 防止背景滚动
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// 点击文档后在移动端自动关闭侧边栏
function selectNodeMobile(nodeId) {
    selectNode(nodeId);
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

// ============================================================
// 工具函数
// ============================================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// Toast 提示
// ============================================================
function showToast(message, type = 'info', duration = 2500) {
    // 移除已有的 toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);
    
    // 触发动画
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    // 自动消失
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============================================================
// 主题切换
// ============================================================
function initTheme() {
    const savedTheme = localStorage.getItem('knowhub_theme') || 'light';
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('knowhub_theme', theme);
    
    // 更新图标
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// 初始化主题
document.addEventListener('DOMContentLoaded', initTheme);

// ============================================================
// 图片点击放大
// ============================================================
document.addEventListener('click', (e) => {
    // 点击 Markdown 中的图片
    if (e.target.matches('.markdown-body img')) {
        openLightbox(e.target.src);
    }
    // 点击遮罩关闭
    if (e.target.matches('.image-lightbox')) {
        closeLightbox();
    }
});

function openLightbox(src) {
    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.innerHTML = `<img src="${src}" alt="放大查看">`;
    document.body.appendChild(lightbox);
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.querySelector('.image-lightbox');
    if (lightbox) {
        lightbox.remove();
        document.body.style.overflow = '';
    }
}

// ESC 关闭图片预览
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLightbox();
    }
});

// ============================================================
// 阅读进度条
// ============================================================
function updateReadingProgress() {
    const container = document.querySelector('.document-content');
    const progressBar = document.getElementById('readingProgress');
    
    if (!container || !progressBar) return;
    
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight - container.clientHeight;
    
    if (scrollHeight > 0) {
        const progress = (scrollTop / scrollHeight) * 100;
        progressBar.style.width = Math.min(progress, 100) + '%';
    } else {
        progressBar.style.width = '0%';
    }
}

// 监听滚动更新进度
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.document-content');
    if (container) {
        container.addEventListener('scroll', updateReadingProgress);
    }
});

function showWelcomeScreen() {
    const siteName = window.SITE_CONFIG?.name || 'KnowHub';
    document.getElementById('documentContent').innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-icon">📖</div>
            <h1>欢迎使用 ${siteName}</h1>
            <p>知识沉淀 · 持续积累 · 随时查阅</p>
            <div class="welcome-tips">
                <div class="tip">
                    <span class="tip-icon">📚</span>
                    <span>从左侧目录选择文档开始阅读</span>
                </div>
                <div class="tip">
                    <span class="tip-icon">🔍</span>
                    <span>使用搜索框快速查找内容</span>
                </div>
                <div class="tip">
                    <span class="tip-icon">💬</span>
                    <span>点击右下角按钮参与讨论或提问</span>
                </div>
            </div>
        </div>
    `;
    hideTOC();
}

// ============================================================
// AI 生成文档目录
// ============================================================
let generatedTree = null;
let aiGenerateParentId = null;

function showAIGenerateDialog(parentId = null, parentName = null) {
    aiGenerateParentId = parentId;
    
    document.getElementById('aiGenerateDrawer').classList.remove('hidden');
    document.getElementById('aiGeneratePrompt').focus();
    document.getElementById('aiGeneratePreview').style.display = 'none';
    document.getElementById('aiGenerateBtnText').textContent = '✨ 生成预览';
    document.getElementById('aiGenerateError').textContent = '';
    generatedTree = null;
    
    // 更新标题和描述
    const titleEl = document.querySelector('.ai-generate-drawer-title');
    const descEl = document.querySelector('.drawer-desc');
    const parentInfoEl = document.getElementById('aiGenerateParentInfo');
    
    if (parentId && parentName) {
        titleEl.innerHTML = '<span>✨</span><span>AI 生成子目录</span>';
        if (parentInfoEl) {
            parentInfoEl.style.display = 'block';
            parentInfoEl.innerHTML = `<span class="parent-label">父节点：</span><span class="parent-name">${escapeHtml(parentName)}</span>`;
        }
        descEl.textContent = `在「${parentName}」下生成子文档结构`;
    } else {
        titleEl.innerHTML = '<span>✨</span><span>AI 生成目录</span>';
        if (parentInfoEl) {
            parentInfoEl.style.display = 'none';
        }
        descEl.textContent = '描述你想要创建的文档结构，AI 将帮你自动生成目录树';
    }
}

function closeAIGenerateDialog() {
    document.getElementById('aiGenerateDrawer').classList.add('hidden');
    document.getElementById('aiGeneratePrompt').value = '';
    generatedTree = null;
    aiGenerateParentId = null;
}

async function generateTreeWithAI() {
    const prompt = document.getElementById('aiGeneratePrompt').value.trim();
    const depth = document.getElementById('aiGenerateDepth').value;
    const errorEl = document.getElementById('aiGenerateError');
    const btnText = document.getElementById('aiGenerateBtnText');
    const btn = document.getElementById('aiGenerateBtn');
    
    if (!prompt) {
        errorEl.textContent = '请输入描述';
        return;
    }
    
    errorEl.textContent = '';
    btn.disabled = true;
    btnText.textContent = '生成中...';
    
    try {
        const response = await fetch('/api/ai/generate-tree', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, depth: parseInt(depth) })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || '生成失败');
        }
        
        const data = await response.json();
        generatedTree = data.tree;
        
        // 显示预览
        renderTreePreview(generatedTree);
        document.getElementById('aiGeneratePreview').style.display = 'block';
        btnText.textContent = '🔄 重新生成';
    } catch (error) {
        errorEl.textContent = error.message;
    } finally {
        btn.disabled = false;
    }
}

function regenerateTree() {
    generateTreeWithAI();
}

function renderTreePreview(tree, container = null, level = 1) {
    if (!container) {
        container = document.getElementById('aiGenerateTree');
        container.innerHTML = '';
    }
    
    tree.forEach(node => {
        const item = document.createElement('div');
        item.className = `preview-tree-item level-${level}`;
        item.innerHTML = `
            <span class="preview-tree-icon">${node.children?.length ? '📁' : '📄'}</span>
            <span>${escapeHtml(node.name)}</span>
        `;
        container.appendChild(item);
        
        if (node.children?.length) {
            renderTreePreview(node.children, container, level + 1);
        }
    });
}

async function confirmAIGenerate() {
    if (!generatedTree) return;
    
    const errorEl = document.getElementById('aiGenerateError');
    const btn = document.getElementById('aiConfirmBtn');
    
    btn.disabled = true;
    btn.textContent = '创建中...';
    
    try {
        const response = await fetch('/api/ai/confirm-tree', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tree: generatedTree,
                parent_id: aiGenerateParentId  // 如果有父节点，则在父节点下创建
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || '创建失败');
        }
        
        showToast('✓ 目录已创建', 'success');
        closeAIGenerateDialog();
        await loadTree();
        
        // 如果有父节点，展开它
        if (aiGenerateParentId) {
            const childrenEl = document.getElementById(`children-${aiGenerateParentId}`);
            if (childrenEl && childrenEl.classList.contains('collapsed')) {
                toggleFolder(aiGenerateParentId);
            }
        }
    } catch (error) {
        errorEl.textContent = error.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '确认创建';
    }
}

// 初始化添加菜单
document.addEventListener('DOMContentLoaded', initAddMenu);

