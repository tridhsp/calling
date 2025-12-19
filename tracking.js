let client;
let loadedUserEmail = null; 
let currentUserRole = null;
let phoneToNameMap = {}; // Store globally for filter use

// Pagination state
let allData = [];           // All fetched data
let filteredData = [];      // Data after applying filters
let currentPage = 1;
const ITEMS_PER_PAGE = 100;

document.addEventListener('DOMContentLoaded', async () => {
    await initSupabase();
});

/* ---------------- Supabase Init & Auth Logic ---------------- */
async function initSupabase() {
    try {
        const res = await fetch('/.netlify/functions/supabase-credentials');
        if (!res.ok) throw new Error('Failed to load credentials');

        const { SUPABASE_URL, SUPABASE_ANON_KEY } = await res.json();
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                storage: window.localStorage,
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });

        const { data: { session } } = await client.auth.getSession();

        if (session) {
            await checkRoleAndLoad(session.user.email);
        } else {
            showLogin();
        }

        client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                if (loadedUserEmail === session.user.email) {
                    console.log('User already loaded, skipping refresh on tab switch.');
                    return;
                }
                checkRoleAndLoad(session.user.email);
            }

            if (event === 'SIGNED_OUT') {
                loadedUserEmail = null;
                showLogin();
            }
        });

        setupLoginHandler();
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => client.auth.signOut());

    } catch (err) {
        console.error('Supabase init error:', err);
    }
}

/* ---------------- Role Check ---------------- */
async function checkRoleAndLoad(email) {
    loadedUserEmail = email;

    document.getElementById('loginCard').style.display = 'none';
    try {
        const { data, error } = await client
            .from('user_roles')
            .select('role')
            .eq('email', email)
            .single();

        if (error || !data) throw new Error('Không tìm thấy quyền hạn.');

        currentUserRole = data.role;

        const allowed = ['Admin', 'Super Admin'];
        if (allowed.includes(data.role)) {
            document.getElementById('trackingContent').style.display = 'block';
            document.getElementById('accessDenied').style.display = 'none';

            const grid = document.getElementById('trackingGrid');
            if (!grid.hasChildNodes() || grid.innerHTML.includes('Đang tải')) {
                loadData();
            }
        } else {
            document.getElementById('trackingContent').style.display = 'none';
            document.getElementById('accessDenied').style.display = 'block';
            await client.auth.signOut();
        }
    } catch (err) {
        console.error(err);
        document.getElementById('accessDenied').style.display = 'block';
    }
}

/* ---------------- UI Helpers ---------------- */
function showLogin() {
    document.getElementById('trackingContent').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'none';
    document.getElementById('loginCard').style.display = 'block';
    loadedUserEmail = null;
}

function setupLoginHandler() {
    const btn = document.getElementById('loginBtn');
    const emailEl = document.getElementById('email');
    const pwdEl = document.getElementById('password');
    const msgEl = document.getElementById('loginMessage');

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        msgEl.textContent = 'Đang đăng nhập...';
        msgEl.className = '';
        const email = emailEl.value.trim();
        const password = pwdEl.value;

        if (!email || !password) {
            msgEl.textContent = 'Vui lòng nhập đầy đủ thông tin';
            msgEl.className = 'error';
            return;
        }
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
            msgEl.textContent = error.message;
            msgEl.className = 'error';
        } else {
            msgEl.textContent = '';
        }
    });
}

/* ---------------- Resolve Phone to Name ---------------- */
async function resolvePhoneToName(rawNumber) {
    if (!client || !rawNumber) return null;

    const cleanNumber = String(rawNumber).replace(/\D/g, '');

    try {
        const { data, error } = await client
            .from('phone_numbers')
            .select('student_name,sdt_hv,sdt_cha,sdt_me,sdt_chi,sdt_ba,sdt_ong');

        if (error || !data) return null;

        for (const row of data) {
            const map = [
                ['sdt_hv', ''],
                ['sdt_cha', '(Cha) '],
                ['sdt_me', '(Mẹ) '],
                ['sdt_chi', '(Chị) '],
                ['sdt_ba', '(Bà) '],
                ['sdt_ong', '(Ông) ']
            ];

            for (const [col, prefix] of map) {
                if (row[col]) {
                    const colClean = String(row[col]).replace(/\D/g, '');
                    if (colClean === cleanNumber) {
                        return (prefix + (row.student_name || '')).trim();
                    }
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}

/* ---------------- Load Filter Options from Database ---------------- */
async function loadFilterOptions() {
    try {
        const res = await fetch('/.netlify/functions/get-filter-options');
        const options = await res.json();

        if (!res.ok) throw new Error(options.error || 'Failed to fetch filter options');

        // Populate Name/Phone dropdown
        const filterName = document.getElementById('filterName');
        filterName.innerHTML = '<option value="">Tất cả</option>';
        filterName.classList.remove('loading');
        
        const nameOptions = [];
        for (const phone of options.phoneNumbers) {
            const name = phoneToNameMap[phone];
            if (name && name !== phone) {
                nameOptions.push({ value: phone, label: name });
            } else {
                nameOptions.push({ value: phone, label: phone });
            }
        }
        
        nameOptions.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
        nameOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            filterName.appendChild(option);
        });

        // Populate Call Direction dropdown
        const filterDirection = document.getElementById('filterDirection');
        filterDirection.innerHTML = '<option value="">Tất cả</option>';
        filterDirection.classList.remove('loading');
        
        options.callTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type === 'OUT' ? 'Gọi đi (OUT)' : type === 'IN' ? 'Gọi đến (IN)' : type;
            filterDirection.appendChild(option);
        });

        // Populate Status dropdown
        const filterStatus = document.getElementById('filterStatus');
        filterStatus.innerHTML = '<option value="">Tất cả</option>';
        filterStatus.classList.remove('loading');
        
        options.dispositions.forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            filterStatus.appendChild(option);
        });

    } catch (err) {
        console.error('Error loading filter options:', err);
        
        ['filterName', 'filterDirection', 'filterStatus'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<option value="">Tất cả</option>';
                el.classList.remove('loading');
            }
        });
    }
}

/* ---------------- Data Loader ---------------- */
async function loadData() {
    const gridContainer = document.getElementById('trackingGrid');
    const refreshBtn = document.getElementById('refreshBtn');

    if (refreshBtn) {
        const newBtn = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
        newBtn.addEventListener('click', () => {
            gridContainer.innerHTML = '';
            phoneToNameMap = {};
            allData = [];
            filteredData = [];
            currentPage = 1;
            loadData();
        });
    }

    if (!gridContainer) return;

    gridContainer.innerHTML = '<div class="full-width-msg"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu...</div>';

    try {
        const res = await fetch('/.netlify/functions/get-tracking-data');
        const data = await res.json();

        data.sort((a, b) => new Date(b.call_date) - new Date(a.call_date));

        if (!res.ok) throw new Error(data.error || 'Failed to fetch');

        if (data.length === 0) {
            gridContainer.innerHTML = '<div class="full-width-msg">Chưa có dữ liệu ghi âm.</div>';
            document.getElementById('paginationSection').style.display = 'none';
            return;
        }

        // Store all data globally
        allData = data;
        filteredData = [...data];

        // Resolve all phone numbers to names
        for (const row of data) {
            if (row.phone_number && !phoneToNameMap[row.phone_number]) {
                const name = await resolvePhoneToName(row.phone_number);
                phoneToNameMap[row.phone_number] = name;
            }
        }

        // Setup filters and pagination
        await loadFilterOptions();
        setupFilters();
        setupPagination();
        
        // Render first page
        currentPage = 1;
        renderCurrentPage();

    } catch (err) {
        console.error(err);
        gridContainer.innerHTML = '<div class="full-width-msg" style="color:#ef4444;">Lỗi tải dữ liệu. Vui lòng thử lại.</div>';
    }
}

/* ---------------- Render Cards for Current Page ---------------- */
function renderCurrentPage() {
    const gridContainer = document.getElementById('trackingGrid');
    gridContainer.innerHTML = '';

    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const pageData = filteredData.slice(startIndex, endIndex);

    if (pageData.length === 0) {
        gridContainer.innerHTML = '<div class="full-width-msg">Không tìm thấy kết quả phù hợp.</div>';
        document.getElementById('paginationSection').style.display = 'none';
        updateFilterCount();
        return;
    }

    pageData.forEach(row => {
        const card = createCardElement(row);
        gridContainer.appendChild(card);
    });

    updatePaginationUI(totalItems, totalPages, startIndex + 1, endIndex);
    updateFilterCount();
    
    gridContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- Create Card Element ---------------- */
function createCardElement(row) {
    const dateStr = row.call_date ? new Date(row.call_date).toLocaleString('vi-VN') : '--';

    let badgeClass = 'status-default';
    const disposition = (row.disposition || '').toLowerCase();
    if (disposition.includes('answer') && !disposition.includes('no')) badgeClass = 'status-answered';
    else if (disposition.includes('miss') || disposition.includes('busy') || disposition.includes('fail')) badgeClass = 'status-missed';
    else if (disposition === 'completed') badgeClass = 'status-answered';

    const uniqueId = 'audio-' + Math.random().toString(36).substr(2, 9);
    let audioHtml = '<span style="font-size:0.8rem; color:#ccc;">Không có ghi âm</span>';
    const primaryUrl = row.original_vbot_url || row.recording_url;

    if (primaryUrl) {
        audioHtml = `<div style="display:flex; flex-direction:column; gap:5px;">
               <div style="display:flex; align-items:center; gap:8px;">
                   <audio controls src="${primaryUrl}" preload="none" style="width:100%; height:32px;"></audio>`;

        if (row.original_vbot_url && row.recording_url) {
            audioHtml += `<i class="fa-solid fa-circle-chevron-down" 
                    title="Show backup recording"
                    style="cursor:pointer; color:#0d6efd; font-size:1.2rem;"
                    onclick="var el=document.getElementById('${uniqueId}'); el.style.display = el.style.display==='none'?'block':'none';"></i>`;
            audioHtml += `</div>
                 <div id="${uniqueId}" style="display:none; margin-top:5px; border-top:1px dashed #eee; padding-top:5px;">
                    <div style="font-size:10px; color:#666;">Backup Source:</div>
                    <audio controls src="${row.recording_url}" preload="none" style="width:100%; height:32px;"></audio>
                 </div>`;
        } else {
            audioHtml += `</div>`;
        }
        audioHtml += `</div>`;
    }

    let vbotLink = '';
    if (row.original_vbot_url) {
        vbotLink = `<div style="margin-top: 5px; font-size: 0.75rem;">
            <a href="${row.original_vbot_url}" target="_blank" class="vbot-link" style="word-break: break-all;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Link
            </a>
          </div>`;
    }

    let deleteBtnHtml = '';
    if (currentUserRole === 'Super Admin') {
        deleteBtnHtml = `<button class="delete-btn" title="Delete Record" onclick="deleteRecord('${row.id}', this)">
            <i class="fa-solid fa-trash-can"></i>
        </button>`;
    }

    const displayName = phoneToNameMap[row.phone_number] || row.phone_number || 'Unknown';

    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.phone = row.phone_number || '';
    card.dataset.callType = row.call_type || '';
    card.dataset.disposition = row.disposition || '';
    card.dataset.duration = row.duration || '0';
    card.dataset.name = displayName.toLowerCase();
    card.dataset.id = row.id;
    
    card.innerHTML = `
        ${deleteBtnHtml}
        <div class="tc-header">
          <span><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
          <span class="badge-type">${row.call_type || 'OUT'}</span>
        </div>
        <div class="tc-body">
          <div>
            <div class="tc-phone">${displayName}</div>
            <div class="tc-mem">Mem: ${row.member_no || '--'}</div>
          </div>
          <span class="badge-status ${badgeClass}">${row.disposition || 'Unknown'}</span>
        </div>
        <div style="font-size:0.85rem; color:#666;">
          <i class="fa-regular fa-clock"></i> Thời lượng: <strong>${row.duration ? row.duration + 's' : '0s'}</strong>
        </div>
        <div class="tc-footer">
          ${audioHtml}
          <div class="tc-actions">
            ${vbotLink}
            <span style="font-size:0.75rem; color:#9ca3af;">${row.processing_status || ''}</span>
          </div>
        </div>`;
    return card;
}

/* ---------------- Delete Function ---------------- */
async function deleteRecord(id, btnElement) {
    if (!confirm('Bạn có chắc chắn muốn xóa không?')) return;

    const icon = btnElement.querySelector('i');
    const oldClass = icon.className;
    icon.className = 'fa-solid fa-spinner fa-spin';

    try {
        const { data: { session } } = await client.auth.getSession();
        
        const res = await fetch('/.netlify/functions/delete-tracking-record', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ id: id })
        });

        if (!res.ok) throw new Error('Delete failed');

        allData = allData.filter(item => item.id !== id);
        filteredData = filteredData.filter(item => item.id !== id);
        renderCurrentPage();

    } catch (err) {
        alert('Lỗi xóa: ' + err.message);
        icon.className = oldClass;
    }
}

/* ---------------- FILTER FUNCTIONALITY ---------------- */
function setupFilters() {
    const filterName = document.getElementById('filterName');
    const filterDirection = document.getElementById('filterDirection');
    const filterStatus = document.getElementById('filterStatus');
    const filterDuration = document.getElementById('filterDuration');
    const filterSearch = document.getElementById('filterSearch');
    const clearBtn = document.getElementById('clearFiltersBtn');
    
    if (!filterName) return;
    
    const elements = [filterName, filterDirection, filterStatus, filterDuration, filterSearch];
    elements.forEach(el => {
        if (el) {
            const newEl = el.cloneNode(true);
            el.parentNode.replaceChild(newEl, el);
        }
    });
    
    const newFilterName = document.getElementById('filterName');
    const newFilterDirection = document.getElementById('filterDirection');
    const newFilterStatus = document.getElementById('filterStatus');
    const newFilterDuration = document.getElementById('filterDuration');
    const newFilterSearch = document.getElementById('filterSearch');
    
    newFilterName.addEventListener('change', applyFilters);
    newFilterDirection.addEventListener('change', applyFilters);
    newFilterStatus.addEventListener('change', applyFilters);
    newFilterDuration.addEventListener('change', applyFilters);
    newFilterSearch.addEventListener('input', debounce(applyFilters, 300));
    
    const newClearBtn = clearBtn.cloneNode(true);
    clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
    
    newClearBtn.addEventListener('click', () => {
        document.getElementById('filterName').value = '';
        document.getElementById('filterDirection').value = '';
        document.getElementById('filterStatus').value = '';
        document.getElementById('filterDuration').value = '';
        document.getElementById('filterSearch').value = '';
        applyFilters();
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function applyFilters() {
    const nameFilter = document.getElementById('filterName').value;
    const directionFilter = document.getElementById('filterDirection').value;
    const statusFilter = document.getElementById('filterStatus').value;
    const durationFilter = parseInt(document.getElementById('filterDuration').value) || 0;
    const searchFilter = document.getElementById('filterSearch').value.toLowerCase().trim();
    
    filteredData = allData.filter(row => {
        if (nameFilter && row.phone_number !== nameFilter) return false;
        if (directionFilter && row.call_type !== directionFilter) return false;
        if (statusFilter && row.disposition !== statusFilter) return false;
        
        if (durationFilter > 0) {
            const rowDuration = parseInt(row.duration) || 0;
            if (rowDuration < durationFilter) return false;
        }
        
        if (searchFilter) {
            const displayName = (phoneToNameMap[row.phone_number] || row.phone_number || '').toLowerCase();
            const searchableText = `${displayName} ${row.phone_number || ''} ${row.member_no || ''} ${row.disposition || ''}`.toLowerCase();
            if (!searchableText.includes(searchFilter)) return false;
        }
        
        return true;
    });
    
    currentPage = 1;
    renderCurrentPage();
}

function updateFilterCount() {
    const visibleEl = document.getElementById('filterVisibleCount');
    const totalEl = document.getElementById('filterTotalCount');
    
    const totalFiltered = filteredData.length;
    
    // Calculate the range (e.g., 1-100)
    let start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    let end = Math.min(currentPage * ITEMS_PER_PAGE, totalFiltered);
    
    if (totalFiltered === 0) {
        start = 0;
        end = 0;
    }

    // Update the display to show range (e.g., "1-100")
    if (visibleEl) visibleEl.textContent = `${start}-${end}`;
    
    // Update the total to show total matches found (e.g., "145")
    if (totalEl) totalEl.textContent = totalFiltered;
}

/* ---------------- PAGINATION FUNCTIONALITY ---------------- */
function setupPagination() {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const gotoBtn = document.getElementById('gotoPageBtn');
    
    [prevBtn, nextBtn, gotoBtn].forEach(btn => {
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
        }
    });
    
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderCurrentPage();
        }
    });
    
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderCurrentPage();
        }
    });
    
    document.getElementById('gotoPageBtn').addEventListener('click', goToPage);
    
    document.getElementById('gotoPageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') goToPage();
    });
}

function goToPage() {
    const gotoInput = document.getElementById('gotoPageInput');
    const targetPage = parseInt(gotoInput.value) || 1;
    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    
    if (targetPage >= 1 && targetPage <= totalPages) {
        currentPage = targetPage;
        renderCurrentPage();
    } else {
        alert(`Vui lòng nhập số trang từ 1 đến ${totalPages}`);
        gotoInput.value = currentPage;
    }
}

function updatePaginationUI(totalItems, totalPages, rangeStart, rangeEnd) {
    const paginationSection = document.getElementById('paginationSection');
    
    // Hide pagination if there are fewer items than the limit per page
    if (totalItems <= ITEMS_PER_PAGE) {
        paginationSection.style.display = 'none';
        return;
    }
    
    // Show the section using the new flex layout
    paginationSection.style.display = 'flex';
    
    // Update the "1-100 of 200" text
    const rangeEl = document.getElementById('pageRangeDisplay');
    if (rangeEl) rangeEl.textContent = `${rangeStart}-${rangeEnd}`;

    const totalEl = document.getElementById('totalItemsDisplay');
    if (totalEl) totalEl.textContent = totalItems;
    
    // Update the 'Go to' input max value and current value
    const gotoInput = document.getElementById('gotoPageInput');
    if (gotoInput) {
        gotoInput.max = totalPages;
        gotoInput.value = currentPage;
    }
    
    // Disable Previous button if on page 1
    const prevBtn = document.getElementById('prevPageBtn');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;

    // Disable Next button if on the last page
    const nextBtn = document.getElementById('nextPageBtn');
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    
    // Render the 1, 2, 3... buttons
    renderPageNumbers(totalPages);
}

function renderPageNumbers(totalPages) {
    const container = document.getElementById('pageNumbers');
    container.innerHTML = '';
    
    // Helper to add a button
    const addBtn = (page) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn' + (page === currentPage ? ' active' : '');
        btn.textContent = page;
        btn.onclick = () => { currentPage = page; renderCurrentPage(); };
        container.appendChild(btn);
    };

    // Helper to add dots
    const addDots = () => {
        const span = document.createElement('span');
        span.className = 'pagination-ellipsis';
        span.textContent = '...';
        container.appendChild(span);
    };

    // Logic to determine which numbers to show
    // We want: 1, ... (siblings), CURRENT, (siblings) ... Last
    const siblings = 1; // How many neighbors on left/right of current
    
    // Always show First Page
    addBtn(1);

    // If current page is far from start, add dots
    if (currentPage > siblings + 2) {
        addDots();
    }

    // Range Start (at least 2)
    let start = Math.max(2, currentPage - siblings);
    // Range End (at most total-1)
    let end = Math.min(totalPages - 1, currentPage + siblings);

    // If we are close to the beginning (e.g. page 3), show 2,3,4 connected to 1
    if (currentPage < siblings + 3) {
        end = Math.min(totalPages - 1, siblings * 2 + 2); // Show a few more
    }

    // If we are close to the end, show connected numbers
    if (currentPage > totalPages - (siblings + 2)) {
        start = Math.max(2, totalPages - (siblings * 2 + 1));
    }

    // Render middle numbers
    for (let i = start; i <= end; i++) {
        addBtn(i);
    }

    // If current page is far from end, add dots
    if (currentPage < totalPages - (siblings + 1)) {
        addDots();
    }

    // Always show Last Page (if distinct from first)
    if (totalPages > 1) {
        addBtn(totalPages);
    }
}

function createPageButton(pageNum) {
    const btn = document.createElement('button');
    btn.className = 'pagination-btn' + (pageNum === currentPage ? ' active' : '');
    btn.textContent = pageNum;
    btn.addEventListener('click', () => {
        currentPage = pageNum;
        renderCurrentPage();
    });
    return btn;
}