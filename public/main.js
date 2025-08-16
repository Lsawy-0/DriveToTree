document.addEventListener('DOMContentLoaded', () => {
    fetch('tree_data.json?v=' + new Date().getTime()) // إضافة timestamp لمنع التخزين المؤقت (cache)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(treeData => {
            if (Object.keys(treeData).length === 0) {
                 const container = document.getElementById('treeContainer');
                 container.innerHTML = '<p>الشجرة فارغة حاليًا. أضف ملفات إلى مجلد Google Drive ليتم عرضها هنا.</p>';
                 return;
            }
            initializeTree(treeData);
        })
        .catch(error => {
            console.error('فشل تحميل بيانات الشجرة:', error);
            const container = document.getElementById('treeContainer');
            if (container) {
                container.innerHTML = '<p style="color: red;">حدث خطأ أثناء تحميل البيانات. قد يكون المجلد فارغاً أو هناك مشكلة في الاتصال.</p>';
            }
        });
});

function initializeTree(treeData) {
    const container = document.getElementById('treeContainer');
    const searchInput = document.getElementById('searchBox');
    const jumpBtn = document.getElementById('jumpBtn');
    const expandAllBtn = document.getElementById('expandAllBtn');
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    const crumbsEl = document.getElementById('breadcrumbs');
    const backLink = document.getElementById('backLink');
    const pageTitle = document.getElementById('pageTitle');
    const subtitle = document.getElementById('subtitle');

    function sortKeys(obj) { return Object.keys(obj).sort((a, b) => a.localeCompare(b, 'ar')); }
    function escapeHtml(str) { return String(str).replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }

    function arraysEqual(a, b){
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i=0; i<a.length; i++){ if (a[i] !== b[i]) return false; }
        return true;
    }

    function getHashParams(){
        const hash = (location.hash || '').replace(/^#/, '');
        const parts = hash ? hash.split('&').map(s => s.split('=')) : [];
        const obj = {};
        parts.forEach(([k,v]) => { if (k) obj[decodeURIComponent(k)] = v ? decodeURIComponent(v) : ''; });
        return obj;
    }
    function setViewRoot(){ location.hash = 'view=root'; }
    function setViewFolder(pathArr){ location.hash = 'view=folder&path=' + encodeURIComponent(JSON.stringify(pathArr)); }

    function getSubtreeByPath(rootMap, pathArr){
        if (!Array.isArray(pathArr) || pathArr.length === 0) return null;
        let curMap = rootMap, node = null;
        for (let i=0;i<pathArr.length;i++){
            const key = pathArr[i];
            node = curMap[key];
            if (!node) return null;
            if (i < pathArr.length-1) curMap = node.children || {};
        }
        return node || null;
    }

    function buildOpenInSeparateLink(currentPath){
        const a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.className = 'open-tab';
        a.textContent = 'عرض منفصل';
        a.title = 'عرض هذا المجلد داخل نفس الملف';
        const pathCopy = currentPath.slice();
        a.onclick = (e) => { e.stopPropagation(); e.preventDefault(); setViewFolder(pathCopy); };
        return a;
    }

    function createNode(node, filter = '', collapsed = true, path = [], focusPath = null, basePath = null, inFolderView = false) {
        let hasVisibleChild = false;
        let childrenArr = [];
        const currentPath = [...path, node.name];

        const isInFocusPath = Array.isArray(focusPath) && focusPath.length > 0 &&
                                focusPath.slice(0, currentPath.length).every((v, i) => v === currentPath[i]);
        const isExactFocus = Array.isArray(focusPath) && focusPath.length === currentPath.length &&
                                focusPath.every((v, i) => v === currentPath[i]);

        if (node.children && Object.keys(node.children).length > 0) {
            const childCollapsed = (filter && filter.length > 0) ? false : collapsed;
            childrenArr = sortKeys(node.children).map(key => {
                const child = createNode(node.children[key], filter, childCollapsed, currentPath, focusPath, basePath, inFolderView);
                if (child) hasVisibleChild = true;
                return child;
            }).filter(Boolean);
        }

        const filterLower = (filter || '').toLowerCase().trim();
        const nameLower = (node.name || '').toLowerCase();
        const isMatch = filterLower ? nameLower.includes(filterLower) : false;

        if (filterLower && !isMatch && !hasVisibleChild) return null;

        const div = document.createElement('div');
        div.className = 'tree-node';
        div.dataset.path = JSON.stringify(currentPath);

        if (isExactFocus) div.classList.add('focused');
        else if (isInFocusPath) div.classList.add('ancestor');
        if (isMatch) div.classList.add('match');

        const content = document.createElement('div');
        content.className = 'node-content';

        const text = document.createElement('span');
        text.className = 'node-text';
        
        let nodeNameHtml = escapeHtml(node.name);
        if (isMatch) {
            const idx = nameLower.indexOf(filterLower);
            const before = node.name.slice(0, idx);
            const mid = node.name.slice(idx, idx + filterLower.length);
            const after = node.name.slice(idx + filterLower.length);
            nodeNameHtml = `${escapeHtml(before)}<mark>${escapeHtml(mid)}</mark>${escapeHtml(after)}`;
        }
        
        const hasChildren = childrenArr.length > 0;
        
        if (hasChildren) {
             const btn = document.createElement('button');
             btn.className = 'collapse-btn';
             const autoCollapsed = (filterLower ? false : collapsed);
             const shouldCollapse = autoCollapsed && !isInFocusPath;
             btn.innerHTML = shouldCollapse ? '&#9654;' : '&#9660;';
             if (shouldCollapse) div.classList.add('collapsed');

             btn.onclick = function(e) {
                 e.stopPropagation();
                 div.classList.toggle('collapsed');
                 btn.innerHTML = div.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
             };
             content.appendChild(btn);
        }

        if (node.link) {
            const a = document.createElement('a');
            a.href = node.link;
            a.target = '_blank';
            a.className = 'node-link';
            a.innerHTML = nodeNameHtml;
            text.appendChild(a);
        } else {
            text.innerHTML = nodeNameHtml;
        }

        if (hasChildren && !(inFolderView && arraysEqual(currentPath, basePath)) && currentPath.length > (basePath ? basePath.length : 0)) {
            content.appendChild(buildOpenInSeparateLink(currentPath));
        }

        content.appendChild(text);
        div.appendChild(content);

        if (hasChildren) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'children';
            childrenArr.forEach(child => childrenDiv.appendChild(child));
            div.appendChild(childrenDiv);
        }

        if (isExactFocus) {
            requestAnimationFrame(() => {
                div.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
        return div;
    }

    function renderTree(treeRootMap, filter = '', focusPath = null, basePath = null, inFolderView = false) {
        container.innerHTML = '';
        const src = treeRootMap || treeData;
        sortKeys(src).forEach(key => {
            const node = createNode(src[key], filter, true, [], focusPath, basePath, inFolderView);
            if (node) container.appendChild(node);
        });
    }

    function findPathByName(obj, targetName, trail = []) {
        for (const key of sortKeys(obj)) {
            const node = obj[key];
            const current = [...trail, node.name];
            if (node.name === targetName) return current;
            if (node.children && Object.keys(node.children).length > 0) {
                const inner = findPathByName(node.children, targetName, current);
                if (inner) return inner;
            }
        }
        return null;
    }

    function expandAll() {
        document.querySelectorAll('.tree-node.collapsed').forEach(n => {
            n.classList.remove('collapsed');
            const btn = n.querySelector('.collapse-btn');
            if (btn) btn.innerHTML = '&#9660;';
        });
    }

    function collapseAll() {
        document.querySelectorAll('.tree-node:not(.collapsed)').forEach(n => {
            const btn = n.querySelector('.collapse-btn');
            if (btn) {
                n.classList.add('collapsed');
                btn.innerHTML = '&#9654;';
            }
        });
    }

    function renderByHash(){
        const params = getHashParams();
        const view = (params.view || 'root').toLowerCase();
        const filterVal = searchInput ? searchInput.value.trim() : '';

        if (view === 'folder') {
            if (backLink) backLink.style.display = 'inline-block';
            if (crumbsEl) crumbsEl.style.display = 'block';
            if (pageTitle) pageTitle.textContent = 'عرض مجلد';
            if (subtitle) subtitle.textContent = 'أنت في وضع عرض مجلد منفصل.';

            let pathArr = [];
            try { pathArr = params.path ? JSON.parse(params.path) : []; } catch(e){ pathArr = []; }

            if (crumbsEl) {
                crumbsEl.innerHTML = '';
                let acc = [];
                pathArr.forEach((name, idx) => {
                    acc.push(name);
                    const seg = acc.slice();
                    const a = document.createElement('a');
                    a.href = 'javascript:void(0)';
                    a.textContent = name;
                    a.onclick = () => setViewFolder(seg);
                    crumbsEl.appendChild(a);
                    if (idx < pathArr.length - 1) {
                        const sep = document.createElement('span'); sep.textContent = ' / '; crumbsEl.appendChild(sep);
                    }
                });
            }

            const node = getSubtreeByPath(treeData, pathArr);
            if (!node) {
                container.textContent = 'تعذر العثور على هذا المسار.';
            } else {
                const rootMap = {}; rootMap[node.name] = node;
                renderTree(rootMap, filterVal, null, pathArr, true);
            }
        } else {
            if (backLink) backLink.style.display = 'none';
            if (crumbsEl) crumbsEl.style.display = 'none';
            if (pageTitle) pageTitle.textContent = 'شجرة عرض المشاريع';
            if (subtitle) subtitle.textContent = 'واجهة تفاعلية يتم تحديثها تلقائياً من Google Drive';
            renderTree(null, filterVal, null, null, false);
        }
    }
    
    // ربط الأحداث
    if (searchInput) {
        searchInput.addEventListener('input', () => renderByHash());
    }
    if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
            const name = prompt('اكتب اسم العنصر المراد الانتقال إليه (مطابقة تامة لاسم العقدة):');
            if (name && name.trim()) {
                const path = findPathByName(treeData, name.trim());
                if (path) {
                    setViewFolder(path);
                } else {
                    alert('لم يتم العثور على العنصر المطلوب.');
                }
            }
        });
    }
    if (expandAllBtn) expandAllBtn.addEventListener('click', expandAll);
    if (collapseAllBtn) collapseAllBtn.addEventListener('click', collapseAll);
    if (backLink) backLink.addEventListener('click', (e) => { e.preventDefault(); setViewRoot(); });

    window.addEventListener('hashchange', renderByHash);

    // العرض الأولي
    if (!location.hash) {
        setViewRoot();
    } else {
        renderByHash();
    }
}
