// SecagemsPro - JavaScript Completo
// Configuração e Estado Global já está no HTML

// ===================================================================
// SISTEMA DE SAVE COM DEBOUNCING E QUEUE (Fase 1 - Trabalho Concorrente)
// ===================================================================
let saveQueue = new Map(); // Map<rowIndex, {fields, timestamp}>
let saveTimer = null;
const SAVE_DEBOUNCE_MS = 1000; // 1 segundo de inatividade
let isSaving = false;

// ===================================================================
// SUPABASE REALTIME (Fase 2 - Sincronização Tempo Real)
// ===================================================================
let realtimeChannel = null;
let isRealtimeActive = false;

// ===================================================================
// FASE 3: SUPABASE PRESENCE - Indicadores de Utilizadores Online
// ===================================================================
let presenceChannel = null;
let onlineUsers = new Map(); // Map<user_id, {name, email, color, cell}>
let myPresenceState = null;
let currentActiveCell = null; // {rowIndex, fieldKey}

// Cores para utilizadores (rotação automática)
const USER_COLORS = [
    '#4285F4', // Azul Google
    '#EA4335', // Vermelho Google
    '#FBBC04', // Amarelo Google
    '#34A853', // Verde Google
    '#FF6D00', // Laranja
    '#9C27B0', // Roxo
    '#00BCD4', // Ciano
    '#E91E63', // Rosa
    '#795548', // Castanho
    '#607D8B'  // Azul-acinzentado
];

function getUserColor(userId) {
    // Hash simples do userId para gerar índice de cor consistente
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ===================================================================
// SISTEMA DE TABS DE SEMANAS (ESTILO EXCEL)
// ===================================================================
let currentWeek = null; // Semana ativa (ex: "9", "10", "11"...)
let weekTabs = []; // Array de semanas do mês atual

// ===================================================================
// UTILS - Detectar conflitos de horário
function detectConflicts(estufaId, startTime, endTime, excludeId = null) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();
    
    console.log(`🔍 Detectando conflitos:`);
    console.log(`   Estufa: ${estufaId}`);
    console.log(`   Período: ${formatDateTime(start)} → ${formatDateTime(end)}`);
    console.log(`   ExcludeId: ${excludeId ? excludeId.slice(0,8) : 'nenhum'}`);
    console.log(`   Agora: ${formatDateTime(now)}`);
    console.log(`   Total de secagens em memória: ${secagens.length}`);
    
    // Listar todas as secagens da estufa
    const secagensEstufa = secagens.filter(s => s.estufa_id === estufaId);
    console.log(`   Secagens da Estufa ${estufaId}: ${secagensEstufa.length}`);
    secagensEstufa.forEach(s => {
        const secEnd = new Date(s.end_time);
        const isFinished = secEnd < now;
        console.log(`      - ${s.id.slice(0,8)}: ${formatDateTime(s.start_time)} → ${formatDateTime(s.end_time)} ${isFinished ? '✅ TERMINADA' : '🔴 ATIVA'}`);
    });
    
    const conflicts = secagens.filter(s => {
        // Ignorar a própria secagem (ao editar)
        if (excludeId && s.id === excludeId) {
            console.log(`   ⏭️ Ignorando própria secagem: ${s.id.slice(0,8)}`);
            return false;
        }
        
        // Apenas mesma estufa
        if (s.estufa_id !== estufaId) return false;
        
        const secStart = new Date(s.start_time);
        const secEnd = new Date(s.end_time);
        
        // 🛡️ IGNORAR SECAGENS JÁ TERMINADAS (passado)
        if (secEnd < now) {
            console.log(`   ⏭️ Ignorando secagem já terminada: ${s.id.slice(0,8)} (terminou em ${formatDateTime(secEnd)})`);
            return false;
        }
        
        // Detectar sobreposição: (start1 < end2) AND (end1 > start2)
        const hasOverlap = (start < secEnd) && (end > secStart);
        
        if (hasOverlap) {
            console.log(`   ⚠️ CONFLITO com ${s.id.slice(0,8)}: ${formatDateTime(secStart)} → ${formatDateTime(secEnd)}`);
        }
        
        return hasOverlap;
    });
    
    console.log(`   ✅ Total de conflitos: ${conflicts.length}`);
    
    return conflicts;
}

// UTILS - Gerar código sequencial da secagem
function getSecagemCode(sec) {
    if (!sec || !sec.estufa_id) return 'SEC_???';
    
    // Filtrar secagens da mesma estufa que são mais antigas
    const samEstufaSecagens = secagens
        .filter(s => s.estufa_id === sec.estufa_id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    // Encontrar o índice desta secagem (baseado em created_at)
    const index = samEstufaSecagens.findIndex(s => s.id === sec.id);
    const sequentialNumber = (index + 1).toString().padStart(3, '0');
    
    const code = `SEC_E${sec.estufa_id}_${sequentialNumber}`;
    
    // Debug
    console.log(`🏷️ Código gerado: ${code} | ID: ${sec.id.slice(0,8)} | Created: ${new Date(sec.created_at).toLocaleString()}`);
    
    return code;
}

// AUTH
async function checkAuthState() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        currentUser = session.user;
        showApp();
        loadAllData();
        setupRealtime();
        updateDateTime();
        setInterval(updateDateTime, 60000);
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    const initials = currentUser.email.substring(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const email = username.toLowerCase() + '@secagens.local';
    
    const btn = document.getElementById('login-btn');
    const btnText = document.getElementById('login-text');
    const btnLoading = document.getElementById('login-loading');
    const errorDiv = document.getElementById('login-error');
    
    btn.disabled = true;
    btnText.classList.add('d-none');
    btnLoading.classList.remove('d-none');
    errorDiv.classList.add('d-none');
    
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        showApp();
        loadAllData();
        setupRealtime();
        showToast('Login realizado com sucesso!');
    } catch (error) {
        errorDiv.textContent = '❌ Credenciais inválidas';
        errorDiv.classList.remove('d-none');
    } finally {
        btn.disabled = false;
        btnText.classList.remove('d-none');
        btnLoading.classList.add('d-none');
    }
});

// LOGOUT
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja sair?')) return;
    
    try {
        // Desconectar realtime
        if (realtimeChannel) {
            await realtimeChannel.unsubscribe();
            realtimeChannel = null;
            console.log('🔌 Realtime desconectado');
        }
        if (presenceChannel) {
            await presenceChannel.unsubscribe();
            presenceChannel = null;
            console.log('🔌 Presence desconectado');
        }
        
        // Fazer logout no Supabase
        await db.auth.signOut();
        
        // Limpar dados locais
        currentUser = null;
        secagens = [];
        onlineUsers.clear();
        myPresenceState = null;
        
        // Limpar UI de utilizadores online
        const onlineContainer = document.getElementById('online-users-container');
        if (onlineContainer) {
            onlineContainer.innerHTML = '';
        }
        
        // Limpar indicadores de células ativas
        document.querySelectorAll('.active-cell-indicator').forEach(el => el.remove());
        
        // Mostrar tela de login
        showLogin();
        
        showToast('✅ Logout realizado com sucesso!', 'success');
        console.log('👋 Utilizador saiu - Dados limpos');
    } catch (error) {
        console.error('❌ Erro ao fazer logout:', error);
        showToast('❌ Erro ao fazer logout', 'error');
    }
});

// TABS
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
        
        if (tabName === 'visualizacao') {
            console.log('🔄 Aba Visualização aberta - recarregando dados...');
            loadAllData().then(() => loadDashboard());
        }
        
        if (tabName === 'encomendas') {
            console.log('📋 Aba Mapa de Encomendas aberta - carregando dados...');
            loadEncomendasData().then(() => {
                // Ativar Realtime após carregar dados
                setupEncomendasRealtime();
                
                // 👥 FASE 3: Ativar sistema de presença
                setupPresence();
            });
        }
    });
});

// DATA
async function loadAllData() {
    await loadSecagens();
    renderGantt();
    updateBadges();
}

async function loadSecagens() {
    try {
        console.log('📥 Carregando secagens da BD...');
        const { data, error } = await db
            .from('secagens')
            .select(`*, cargo:secagem_cargo(*)`)
            .order('start_time');
        if (error) throw error;
        secagens = data || [];
        
        console.log(`✅ Carregadas ${secagens.length} secagens da BD:`);
        secagens.forEach(s => {
            console.log(`   - ${s.id.slice(0,8)}: Estufa ${s.estufa_id} | ${s.cliente} | ${formatDateTime(s.start_time)} → ${formatDateTime(s.end_time)}`);
        });
    } catch (error) {
        console.error('Error:', error);
        showToast('Erro ao carregar dados', 'error');
    }
}

function updateDateTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = formatTime(now);
    document.getElementById('current-date-header').textContent = now.toLocaleDateString('pt-PT');
    document.getElementById('dashboard-subtitle').textContent = `Estado atual das 7 estufas — ${now.toLocaleDateString('pt-PT')}`;
}

function updateBadges() {
    const totalSecagens = secagens.length;
    const now = new Date();
    const activeSecagens = secagens.filter(s => 
        new Date(s.start_time) <= now && new Date(s.end_time) >= now
    ).length;
    
    document.getElementById('badge-planeamento').textContent = totalSecagens;
    document.getElementById('badge-visualizacao').textContent = activeSecagens;
}

// GANTT
function renderGantt() {
    const grid = document.getElementById('gantt-grid');
    grid.innerHTML = '';
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 2);
    
    const days = [];
    for (let i = 0; i < 10; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        days.push(d);
    }
    
    // Update date range
    const firstDay = formatDate(days[0]);
    const lastDay = formatDate(days[9]);
    document.getElementById('gantt-date-range').textContent = `${firstDay} — ${lastDay}`;
    
    // Header
    const headerCell = document.createElement('div');
    headerCell.className = 'gantt-cell gantt-header-cell';
    headerCell.textContent = 'ESTUFA';
    grid.appendChild(headerCell);
    
    days.forEach(day => {
        const cell = document.createElement('div');
        cell.className = 'gantt-cell gantt-header-cell';
        const dayName = day.toLocaleDateString('pt-PT', {weekday: 'short', day: '2-digit'});
        const monthName = day.toLocaleDateString('pt-PT', {month: 'short'}).toUpperCase();
        cell.innerHTML = `<div>${dayName.split(' ')[0].toUpperCase()}</div><div style="font-weight: 700; font-size: 15px;">${dayName.split(' ')[1]}</div>`;
        
        if (day.toDateString() === today.toDateString()) {
            cell.classList.add('today');
        }
        
        grid.appendChild(cell);
    });
    
    // Estufas - criar linhas uma de cada vez
    for (let estufaId = 1; estufaId <= 7; estufaId++) {
        const estufaCell = document.createElement('div');
        estufaCell.className = 'gantt-cell gantt-estufa-cell';
        
        const hasActiveSecagem = secagens.some(s => 
            s.estufa_id === estufaId && 
            new Date(s.start_time) <= today && 
            new Date(s.end_time) >= today
        );
        
        estufaCell.innerHTML = `
            <div class="estufa-name">
                <div class="estufa-dot" style="background: ${ESTUFA_COLORS[estufaId - 1]}"></div>
                <span>Estufa ${estufaId}</span>
            </div>
        `;
        grid.appendChild(estufaCell);
        
        // Criar todas as células do dia para esta estufa
        days.forEach((day, dayIndex) => {
            const cell = document.createElement('div');
            cell.className = 'gantt-cell gantt-day-cell';
            
            if (day < today) cell.classList.add('past');
            if (day.toDateString() === today.toDateString()) cell.classList.add('today');
            
            cell.addEventListener('click', () => {
                console.log('🔘 Clique na célula vazia:', `Estufa ${estufaId}`, formatDate(day));
                openNewSecagemModal(estufaId, day);
            });
            
            // Buscar secagens que INICIAM neste dia
            const daySecagens = secagens.filter(s => {
                if (s.estufa_id !== estufaId) return false;
                
                const secStartDate = new Date(s.start_time);
                const secStartDay = new Date(secStartDate);
                secStartDay.setHours(0, 0, 0, 0);
                
                return secStartDay.getTime() === day.getTime();
            });
            
            daySecagens.forEach(sec => {
                const secStartDate = new Date(sec.start_time);
                const secEndDate = new Date(sec.end_time);
                
                // ✅ CÁLCULO CORRETO: offset inicial + largura total
                // Exemplo: 26/02 às 17:07 até 28/02 às 17:07 (48h)
                
                // 1. Offset dentro do primeiro dia (em % do dia)
                const startHour = secStartDate.getHours() + secStartDate.getMinutes() / 60;
                const startOffsetPct = (startHour / 24) * 100; // % do dia até à hora de início
                
                // 2. Duração total em dias fracionais
                const totalHours = (secEndDate - secStartDate) / (1000 * 60 * 60);
                const fractionalDays = totalHours / 24;
                
                // 3. Largura em % (baseada no número de células)
                const widthPct = fractionalDays * 100; // cada célula = 100%
                
                console.log(`📅 ${sec.id.slice(0,6)}: ${formatDateTime(sec.start_time)} → ${formatDateTime(sec.end_time)}`);
                console.log(`   Offset: ${startOffsetPct.toFixed(1)}% | Largura: ${widthPct.toFixed(1)}% (${fractionalDays.toFixed(2)} dias)`);
                
                const block = document.createElement('div');
                block.className = 'secagem-block';
                block.style.background = ESTUFA_COLORS[estufaId - 1];
                block.style.position = 'absolute';
                block.style.left = `${startOffsetPct}%`;
                block.style.width = `calc(${widthPct}% - 16px)`; // -16px para margin
                
                // ⚠️ Detectar conflitos e marcar visualmente
                const conflicts = detectConflicts(estufaId, secStartDate, secEndDate, sec.id);
                if (conflicts.length > 0) {
                    block.classList.add('conflict');
                    block.title = `⚠️ CONFLITO: sobrepõe-se a ${conflicts.map(c => getSecagemCode(c)).join(', ')}`;
                }
                
                const cliente = sec.cargo?.[0]?.cliente || '';
                const cargoCount = sec.cargo?.length || 0;
                
                block.innerHTML = `
                    <div class="secagem-id">${getSecagemCode(sec)}</div>
                    <div class="secagem-time">${formatTime(sec.start_time)} → ${formatTime(sec.end_time)}</div>
                    <div class="secagem-cliente">${cliente}</div>
                    <div class="secagem-badges">
                        ${sec.super_dry ? '<span class="secagem-badge">SD</span>' : ''}
                        ${cargoCount > 1 ? `<span class="secagem-badge">+${cargoCount - 1}</span>` : ''}
                    </div>
                `;
                
                block.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('🔵 Clique no bloco:', getSecagemCode(sec));
                    editSecagem(sec);
                });
                
                cell.appendChild(block);
            });
            
            grid.appendChild(cell);
        });
    }
}

document.getElementById('prev-day').addEventListener('click', () => {
    currentGanttDate.setDate(currentGanttDate.getDate() - 1);
    renderGantt();
});

document.getElementById('next-day').addEventListener('click', () => {
    currentGanttDate.setDate(currentGanttDate.getDate() + 1);
    renderGantt();
});

document.getElementById('today-btn').addEventListener('click', () => {
    currentGanttDate = new Date();
    renderGantt();
});

// DASHBOARD
async function loadDashboard() {
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = '';
    
    const now = new Date();
    let ativas = 0, livres = 0, superDry = 0;
    
    // Labels das seções
    const pinturaLabel = document.createElement('div');
    pinturaLabel.className = 'factory-label label-pintura';
    pinturaLabel.textContent = 'PINTURA';
    grid.appendChild(pinturaLabel);
    
    const caldeirasLabel = document.createElement('div');
    caldeirasLabel.className = 'factory-label label-caldeiras';
    caldeirasLabel.textContent = 'CALDEIRAS';
    grid.appendChild(caldeirasLabel);
    
    for (let estufaId = 1; estufaId <= 7; estufaId++) {
        // Encontrar secagem ATIVA (que está acontecendo agora)
        const activeSec = secagens.find(s => {
            if (s.estufa_id !== estufaId) return false;
            
            const start = new Date(s.start_time);
            const end = new Date(s.end_time);
            
            // Debug: descomentar para ver as comparações de datas
            const isActive = start <= now && end >= now;
            
            if (!isActive && s.estufa_id === estufaId) {
                console.log(`⚠️ Estufa ${estufaId} - Secagem NÃO ATIVA:`, getSecagemCode(s));
                console.log(`   Início: ${start.toLocaleString()} | Fim: ${end.toLocaleString()} | Agora: ${now.toLocaleString()}`);
                if (start > now) console.log(`   Motivo: Ainda não começou (futura)`);
                if (end < now) console.log(`   Motivo: Já terminou`);
            }
            
            return isActive;
        });
        
        const card = document.createElement('div');
        card.className = 'estufa-card';
        card.setAttribute('data-estufa', estufaId);
        card.style.background = ESTUFA_COLORS[estufaId - 1];
        
        // Apenas número e status simples (sem pre-visualização)
        const statusText = activeSec ? 'EM SECAGEM' : 'Livre';
        card.innerHTML = `
            <div class="estufa-simple-number">${estufaId}</div>
            <div class="estufa-simple-status">${statusText}</div>
        `;
        
        // Clique para abrir detalhe (ou criar nova)
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            if (activeSec) {
                editSecagem(activeSec);
            } else {
                openNewSecagemModal(estufaId, new Date());
            }
        });
        
        grid.appendChild(card);
    }
    
    // Adicionar área central (espaço de trabalho)
    const workspace = document.createElement('div');
    workspace.className = 'factory-workspace';
    workspace.innerHTML = '🏭 Área de Trabalho';
    grid.appendChild(workspace);
    
    document.getElementById('stat-ativas').textContent = ativas;
    document.getElementById('stat-livres').textContent = livres;
    document.getElementById('stat-super-dry').textContent = superDry;
}

// MODAL
function openNewSecagemModal(estufaId, date) {
    document.getElementById('modal-title').textContent = 'Nova Secagem';
    document.getElementById('modal-subtitle').textContent = `Estufa ${estufaId || 1}`;
    document.getElementById('form-secagem').reset();
    document.getElementById('secagem-id').value = '';
    document.getElementById('input-estufa').value = estufaId || 1;
    
    const dateStr = (date || new Date()).toISOString().slice(0, 16);
    document.getElementById('input-start').value = dateStr;
    document.getElementById('input-duration').value = '48';
    
    updateModalSidebar(estufaId || 1);
    calculateEndTime();
    
    // Limpar matriz
    loadMatrixData([]);
    
    document.getElementById('btn-delete').classList.add('d-none');
    openModal();
}

function editSecagem(sec) {
    document.getElementById('modal-title').textContent = `Editar — ${getSecagemCode(sec)}`;
    document.getElementById('modal-subtitle').textContent = `Estufa ${sec.estufa_id} · ${sec.duration_hours}h`;
    document.getElementById('secagem-id').value = sec.id;
    document.getElementById('input-estufa').value = sec.estufa_id;
    document.getElementById('input-start').value = new Date(sec.start_time).toISOString().slice(0, 16);
    document.getElementById('input-duration').value = sec.duration_hours;
    document.getElementById('input-obs').value = sec.obs || '';
    
    updateModalSidebar(sec.estufa_id);
    calculateEndTime();
    
    // Carregar dados na matriz
    loadMatrixData(sec.cargo || []);
    
    document.getElementById('btn-delete').classList.remove('d-none');
    openModal();
}

function openModal() {
    document.getElementById('modal-secagem').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-secagem').classList.remove('active');
}

function updateModalSidebar(estufaId) {
    document.getElementById('modal-sidebar').style.background = ESTUFA_COLORS[estufaId - 1];
}

// ✅ SISTEMA DE MATRIZ DE CARGA COM SELEÇÃO MÚLTIPLA
let selectedCells = [];
let matrixData = {}; // {cellId: {tipo, cliente, lotes}}

function initMatrixSystem() {
    const cells = document.querySelectorAll('.matrix-cell');
    
    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            const cellId = cell.getAttribute('data-cell');
            
            // Multi-seleção com Ctrl/Cmd
            if (e.ctrlKey || e.metaKey) {
                if (selectedCells.includes(cellId)) {
                    selectedCells = selectedCells.filter(id => id !== cellId);
                    cell.classList.remove('selected');
                } else {
                    selectedCells.push(cellId);
                    cell.classList.add('selected');
                }
            } else {
                // Seleção única
                cells.forEach(c => c.classList.remove('selected'));
                selectedCells = [cellId];
                cell.classList.add('selected');
            }
            
            updateSelectionLabel();
        });
    });
}

function updateSelectionLabel() {
    const label = document.getElementById('selected-cells-label');
    if (selectedCells.length === 0) {
        label.textContent = 'Selecione células (Ctrl+clique para múltiplas)';
        label.style.color = '#86868B';
    } else {
        label.textContent = `${selectedCells.length} célula(s) selecionada(s)`;
        label.style.color = '#007AFF';
    }
}

function fillSelectedCells() {
    const tipo = document.getElementById('cargo-tipo').value.trim();
    const cliente = document.getElementById('cargo-cliente').value.trim();
    const lotes = document.getElementById('cargo-lotes').value.trim();
    
    if (!tipo || !cliente || !lotes) {
        showToast('Preencha todos os campos', 'error');
        return;
    }
    
    if (selectedCells.length === 0) {
        showToast('Selecione pelo menos uma célula', 'error');
        return;
    }
    
    const cellsFilled = selectedCells.length;
    
    selectedCells.forEach(cellId => {
        matrixData[cellId] = { tipo, cliente, lotes };
        
        const cell = document.querySelector(`[data-cell="${cellId}"]`);
        cell.classList.remove('selected');
        cell.classList.add('filled');
        cell.innerHTML = `
            <div class="cell-tipo">${tipo}</div>
            <div class="cell-cliente">${cliente}</div>
            <div class="cell-lotes">${lotes} lotes</div>
        `;
    });
    
    selectedCells = [];
    updateSelectionLabel();
    
    // Limpar inputs
    document.getElementById('cargo-tipo').value = '';
    document.getElementById('cargo-cliente').value = '';
    document.getElementById('cargo-lotes').value = '';
    
    console.log('✅ MatrixData atualizado:', matrixData);
    console.log(`   Total de células preenchidas: ${Object.keys(matrixData).length}`);
    
    showToast(`${cellsFilled} célula(s) preenchida(s)`, 'success');
}

function clearSelectedCells() {
    if (selectedCells.length === 0) {
        showToast('Selecione células para limpar', 'error');
        return;
    }
    
    selectedCells.forEach(cellId => {
        delete matrixData[cellId];
        
        const cell = document.querySelector(`[data-cell="${cellId}"]`);
        cell.classList.remove('selected', 'filled');
        cell.innerHTML = '';
    });
    
    selectedCells = [];
    updateSelectionLabel();
    showToast('Células limpas', 'success');
}

function loadMatrixData(cargoArray) {
    // Limpar matriz
    matrixData = {};
    document.querySelectorAll('.matrix-cell').forEach(cell => {
        cell.classList.remove('filled', 'selected');
        cell.innerHTML = '';
    });
    
    // Carregar dados
    if (cargoArray && cargoArray.length > 0) {
        cargoArray.forEach(item => {
            if (item.posicao) {
                const cellId = item.posicao;
                matrixData[cellId] = {
                    tipo: item.tipo_palete,
                    cliente: item.cliente,
                    lotes: item.quantidade
                };
                
                const cell = document.querySelector(`[data-cell="${cellId}"]`);
                if (cell) {
                    cell.classList.add('filled');
                    cell.innerHTML = `
                        <div class="cell-tipo">${item.tipo_palete}</div>
                        <div class="cell-cliente">${item.cliente}</div>
                        <div class="cell-lotes">${item.quantidade} lotes</div>
                    `;
                }
            }
        });
    }
    
    selectedCells = [];
    updateSelectionLabel();
}

function getMatrixCargoData() {
    // Converter matrixData em array para salvar
    return Object.entries(matrixData).map(([cellId, data]) => ({
        posicao: cellId,
        tipo_palete: data.tipo,
        cliente: data.cliente,
        quantidade: parseInt(data.lotes)
    }));
}

function calculateEndTime() {
    const start = document.getElementById('input-start').value;
    const duration = parseInt(document.getElementById('input-duration').value);
    
    if (start && duration) {
        const startDate = new Date(start);
        const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
        document.getElementById('input-end').value = formatDateTime(endDate);
    }
}

document.getElementById('input-start').addEventListener('change', calculateEndTime);
document.getElementById('input-duration').addEventListener('input', calculateEndTime);

document.getElementById('form-secagem').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const secagemId = document.getElementById('secagem-id').value;
    const estufaId = parseInt(document.getElementById('input-estufa').value);
    const startTime = document.getElementById('input-start').value;
    const duration = parseInt(document.getElementById('input-duration').value);
    const obs = document.getElementById('input-obs').value;
    
    // ✅ Calcular end time
    const startDate = new Date(startTime);
    const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
    
    console.log('📅 Cálculo de datas:');
    console.log(`   Início: ${formatDateTime(startDate)}`);
    console.log(`   Duração: ${duration} horas`);
    console.log(`   Fim calculado: ${formatDateTime(endDate)}`);
    console.log(`   Diferença em dias: ${(endDate - startDate) / (1000 * 60 * 60 * 24)} dias`);
    
    // 🔄 RECARREGAR SECAGENS DA BD (para evitar conflitos fantasma)
    console.log('🔄 Recarregando secagens da BD antes de validar conflitos...');
    await loadAllData();
    
    // ⚠️ VALIDAR CONFLITOS DE HORÁRIO
    const conflicts = detectConflicts(estufaId, startDate, endDate, secagemId);
    
    if (conflicts.length > 0) {
        console.warn('⚠️ CONFLITO DE HORÁRIO DETECTADO!');
        console.warn(`   Nova secagem: Estufa ${estufaId} | ${formatDateTime(startDate)} → ${formatDateTime(endDate)}`);
        console.warn(`   Total de secagens em memória: ${secagens.length}`);
        console.warn(`   Conflitos encontrados: ${conflicts.length}`);
        conflicts.forEach(c => {
            console.warn(`   - ${getSecagemCode(c)}: ${formatDateTime(c.start_time)} → ${formatDateTime(c.end_time)} | ID: ${c.id.slice(0,8)}`);
        });
        
        const conflictNames = conflicts.map(c => getSecagemCode(c)).join(', ');
        const message = `⚠️ CONFLITO DE HORÁRIO!\n\nA nova secagem sobrepõe-se a:\n${conflictNames}\n\nEstufa ${estufaId} já está ocupada nesse período.\n\nPretende guardar na mesma? (Não recomendado)`;
        
        if (!confirm(message)) {
            console.log('❌ Utilizador cancelou devido a conflito de horário');
            return; // Cancela o save
        }
        
        console.log('⚠️ Utilizador optou por guardar apesar do conflito');
    }
    
    // ✅ Obter dados da matriz
    const cargoItems = getMatrixCargoData();
    
    console.log('💾 SALVANDO SECAGEM:');
    console.log('   MatrixData:', matrixData);
    console.log('   CargoItems:', cargoItems);
    console.log('   Total de células preenchidas:', cargoItems.length);
    
    // Validar dados do cargo
    if (cargoItems.length > 0) {
        console.log('🔍 VALIDANDO CARGO:');
        cargoItems.forEach((item, index) => {
            console.log(`   Item ${index + 1}:`, {
                posicao: item.posicao,
                tipo_posicao: typeof item.posicao,
                tipo_palete: item.tipo_palete,
                cliente: item.cliente,
                quantidade: item.quantidade,
                tipo_quantidade: typeof item.quantidade
            });
            
            // Validações
            if (!item.posicao) console.warn(`   ⚠️ Item ${index + 1}: posicao está vazio!`);
            if (typeof item.posicao !== 'string') console.warn(`   ⚠️ Item ${index + 1}: posicao não é string!`);
            if (!item.tipo_palete) console.warn(`   ⚠️ Item ${index + 1}: tipo_palete está vazio!`);
            if (!item.cliente) console.warn(`   ⚠️ Item ${index + 1}: cliente está vazio!`);
            if (!item.quantidade || isNaN(item.quantidade)) console.warn(`   ⚠️ Item ${index + 1}: quantidade inválida!`);
        });
    }
    
    try {
        if (secagemId) {
            const { error } = await db.from('secagens').update({
                estufa_id: estufaId,
                start_time: startTime,
                end_time: endDate.toISOString(),  // ← ADICIONAR end_time explicitamente
                duration_hours: duration,
                obs: obs,
                updated_by: currentUser.id
            }).eq('id', secagemId);
            
            if (error) throw error;
            
            await db.from('secagem_cargo').delete().eq('secagem_id', secagemId);
            if (cargoItems.length > 0) {
                const cargoToInsert = cargoItems.map(c => ({ ...c, secagem_id: secagemId }));
                console.log('📦 INSERINDO CARGO (UPDATE):', cargoToInsert);
                const { data: cargoData, error: cargoError } = await db.from('secagem_cargo').insert(cargoToInsert).select();
                if (cargoError) {
                    console.error('❌ ERRO AO INSERIR CARGO:');
                    console.error('   Mensagem:', cargoError.message);
                    console.error('   Código:', cargoError.code);
                    console.error('   Detalhes:', cargoError.details);
                    console.error('   Hint:', cargoError.hint);
                    console.error('   Objeto completo:', JSON.stringify(cargoError, null, 2));
                    throw cargoError;
                }
                console.log('✅ CARGO INSERIDO:', cargoData);
            }
            
            showToast('Secagem atualizada!');
        } else {
            const { data: newSec, error } = await db.from('secagens').insert({
                estufa_id: estufaId,
                start_time: startTime,
                end_time: endDate.toISOString(),  // ← ADICIONAR end_time explicitamente
                duration_hours: duration,
                obs: obs,
                status: 'planeada',
                created_by: currentUser.id,
                updated_by: currentUser.id
            }).select().single();
            
            if (error) throw error;
            
            if (cargoItems.length > 0) {
                const cargoToInsert = cargoItems.map(c => ({ ...c, secagem_id: newSec.id }));
                console.log('📦 INSERINDO CARGO (NEW):', cargoToInsert);
                const { data: cargoData, error: cargoError } = await db.from('secagem_cargo').insert(cargoToInsert).select();
                if (cargoError) {
                    console.error('❌ ERRO AO INSERIR CARGO:');
                    console.error('   Mensagem:', cargoError.message);
                    console.error('   Código:', cargoError.code);
                    console.error('   Detalhes:', cargoError.details);
                    console.error('   Hint:', cargoError.hint);
                    console.error('   Objeto completo:', JSON.stringify(cargoError, null, 2));
                    throw cargoError;
                }
                console.log('✅ CARGO INSERIDO:', cargoData);
            } else {
                console.log('⚠️ NENHUM CARGO PARA INSERIR (matrixData vazio)');
            }
            
            showToast('Secagem criada!');
        }
        
        await loadAllData();
        closeModal();
    } catch (error) {
        console.error('Error:', error);
        showToast('Erro ao guardar', 'error');
    }
});

async function deleteSecagem() {
    if (!confirm('Eliminar esta secagem?')) return;
    
    const secagemId = document.getElementById('secagem-id').value;
    
    try {
        const { error } = await db.from('secagens').delete().eq('id', secagemId);
        if (error) throw error;
        showToast('Secagem eliminada');
        await loadAllData();
        closeModal();
    } catch (error) {
        showToast('Erro ao eliminar', 'error');
    }
}

// REALTIME
function setupRealtime() {
    const channel = db
        .channel('secagens-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'secagens' }, async () => {
            await loadAllData();
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            if (activeTab === 'visualizacao') loadDashboard();
        })
        .subscribe();
}

// MAPA DE ENCOMENDAS - Excel Grid (DATAS nas LINHAS, CAMPOS nas COLUNAS)
let currentMonth = 'mar';  // Mês atual selecionado
let currentYear = 2026;

let encomendasData = {
    dates: [],  // Será carregado da BD
    fields: [
        { label: 'SEM', key: 'sem', color: '#FFFFFF', width: '60px' },
        { label: 'CLIENTE', key: 'cliente', color: '#FFFFFF', width: '150px' },
        { label: 'LOCAL', key: 'local', color: '#FFFFFF', width: '120px' },
        { label: 'MEDIDA', key: 'medida', color: '#FFFFFF', width: '100px' },
        { label: 'QTD', key: 'qtd', color: '#FFFFFF', width: '80px' },
        { label: 'TRANSP', key: 'transp', color: '#FFFFFF', width: '120px' },
        { label: 'E.T.*', key: 'et', color: '#D9E1F2', width: '80px' },
        { label: 'ENC.', key: 'enc', color: '#FFFFFF', width: '100px' },
        { label: 'NºVIAGEM', key: 'nviagem', color: '#FFFFFF', width: '100px' },
        { label: 'OBSERVAÇÕES', key: 'obs', color: '#FFFFFF', width: '200px' }
    ],
    data: {}  // {date_field: value}
};

const monthNames = {
    'jan': 'Janeiro', 'fev': 'Fevereiro', 'mar': 'Março',
    'abr': 'Abril', 'mai': 'Maio', 'jun': 'Junho',
    'jul': 'Julho', 'ago': 'Agosto', 'set': 'Setembro',
    'out': 'Outubro', 'nov': 'Novembro', 'dez': 'Dezembro'
};

// ===================================================================
// FUNÇÕES PARA TABS DE SEMANAS
// ===================================================================

// Gerar tabs de semanas do mês atual
function generateWeekTabs() {
    try {
        const container = document.getElementById('week-tabs-container');
        if (!container) {
            console.warn('⚠️ Container de tabs de semanas não encontrado');
            return;
        }
    
    container.innerHTML = '';
    
    // Descobrir semanas do mês atual
    const monthIndex = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
    }[currentMonth];
    
    const firstDay = new Date(currentYear, monthIndex, 1);
    const lastDay = new Date(currentYear, monthIndex + 1, 0);
    
    const weeks = new Set();
    
    // Iterar por todos os dias do mês e coletar números de semana
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const weekNum = getWeekNumber(d);
        weeks.add(weekNum);
    }
    
    weekTabs = Array.from(weeks).sort((a, b) => a - b);
    
    // Se não há semana ativa, selecionar a primeira
    if (!currentWeek && weekTabs.length > 0) {
        currentWeek = weekTabs[0];
    }
    
    // Criar tabs
    weekTabs.forEach(week => {
        const tab = document.createElement('div');
        tab.className = 'week-tab';
        if (week === currentWeek) {
            tab.classList.add('active');
        }
        tab.textContent = `Semana ${week}`;
        tab.onclick = () => switchToWeek(week);
        container.appendChild(tab);
    });
    
    // Botão +
    const addBtn = document.createElement('button');
    addBtn.className = 'week-tab-add';
    addBtn.innerHTML = '+';
    addBtn.title = 'Adicionar nova semana';
    addBtn.onclick = addNewWeek;
    container.appendChild(addBtn);
    
    console.log(`✅ Tabs de semanas geradas: ${weekTabs.length} semanas`);
    
    } catch (error) {
        console.error('❌ Erro ao gerar tabs de semanas:', error);
    }
}

// Mudar para outra semana
function switchToWeek(weekNumber) {
    currentWeek = weekNumber;
    
    // Atualizar tabs visuais
    const tabs = document.querySelectorAll('.week-tab');
    tabs.forEach(tab => {
        if (tab.textContent === `Semana ${weekNumber}`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Re-renderizar grid apenas com dados da semana selecionada
    renderEncomendasGrid();
}

// Adicionar nova semana
async function addNewWeek() {
    // Próxima semana após a última
    const nextWeek = weekTabs.length > 0 ? Math.max(...weekTabs) + 1 : 1;
    
    weekTabs.push(nextWeek);
    weekTabs.sort((a, b) => a - b);
    
    // Pré-popular essa semana com 7 dias × 20 linhas
    prePopulateWeek(nextWeek);
    
    // Salvar no Supabase
    await saveAllRows();
    
    // Re-gerar tabs
    generateWeekTabs();
    
    // Mudar para a nova semana
    switchToWeek(nextWeek);
    
    showToast(`✅ Semana ${nextWeek} adicionada`, 'success');
}

// ⚠️ FORÇAR PRÉ-POPULAÇÃO DO MÊS (apagar dados existentes)
async function forcePrePopulateMonth() {
    const totalLinhas = encomendasData.dates.length;
    
    const confirmMsg = totalLinhas > 0 
        ? `⚠️ ATENÇÃO!\n\nEste mês tem ${totalLinhas} linhas existentes.\n\nPré-popular irá:\n✅ Criar estrutura completa (Seg-Sex: 20 linhas, Sáb: 5, Dom: 0)\n❌ APAGAR todos os dados atuais\n\nTem certeza?`
        : `✅ Pré-popular ${monthNames[currentMonth]} 2026?\n\nSerá criada a estrutura completa:\n• Segunda a Sexta: 20 linhas/dia\n• Sábado: 5 linhas/dia\n• Domingo: 0 linhas`;
    
    if (!confirm(confirmMsg)) {
        console.log('❌ Pré-população cancelada pelo utilizador');
        return;
    }
    
    console.log('🔄 Forçando pré-população do mês:', currentMonth, '/', currentYear);
    
    try {
        // 1. APAGAR dados antigos do Supabase
        console.log('🗑️ Apagando dados antigos...');
        const { error: deleteError } = await db
            .from('mapa_encomendas')
            .delete()
            .eq('month', currentMonth)
            .eq('year', currentYear);
        
        if (deleteError) {
            console.error('❌ Erro ao apagar:', deleteError);
            throw deleteError;
        }
        
        console.log('✅ Dados antigos apagados');
        
        // 2. Criar estrutura nova
        prePopulateMonth();
        
        // 3. Salvar no Supabase
        console.log('💾 Salvando nova estrutura...');
        await saveAllRows();
        
        // 4. Regenerar tabs e grid
        generateWeekTabs();
        renderEncomendasGrid();
        
        showToast(`✅ Mês pré-populado com ${encomendasData.dates.length} linhas!`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao pré-popular:', error);
        showToast('❌ Erro ao pré-popular. Verifique o console.', 'error');
    }
}

// Pré-popular MÊS INTEIRO automaticamente
// Estrutura: Seg-Sex = 20 linhas, Sábado = 5 linhas, Domingo = 0 linhas
function prePopulateMonth() {
    // Limpar dados
    encomendasData.dates = [];
    encomendasData.data = {};
    
    const monthIndex = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
    }[currentMonth];
    
    const firstDay = new Date(currentYear, monthIndex, 1);
    const lastDay = new Date(currentYear, monthIndex + 1, 0);
    
    let totalLines = 0;
    let dayCount = 0;
    
    console.log(`📅 Pré-populando ${currentMonth}/${currentYear}...`);
    console.log(`   Primeiro dia: ${firstDay.toLocaleDateString()}`);
    console.log(`   Último dia: ${lastDay.toLocaleDateString()}`);
    
    // Iterar por todos os dias do mês
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${currentMonth}`;
        const weekNum = getWeekNumber(d);
        const dayOfWeek = d.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sábado
        
        // Determinar número de linhas baseado no dia da semana
        let numLines = 0;
        if (dayOfWeek === 0) {
            // Domingo: 0 linhas (não criar nada)
            numLines = 0;
        } else if (dayOfWeek === 6) {
            // Sábado: 5 linhas
            numLines = 5;
        } else {
            // Segunda a Sexta: 20 linhas
            numLines = 20;
        }
        
        if (numLines > 0) {
            dayCount++;
        }
        
        // Criar linhas para este dia
        for (let i = 0; i < numLines; i++) {
            const index = encomendasData.dates.length;
            encomendasData.dates.push(dateStr);
            
            // Pré-preencher semana
            const semKey = `${index}_sem`;
            encomendasData.data[semKey] = weekNum.toString();
        }
        
        totalLines += numLines;
    }
    
    console.log(`✅ Mês pré-populado: ${totalLines} linhas total em ${dayCount} dias`);
    console.log(`   📅 Estrutura: Seg-Sex (20 linhas) + Sáb (5 linhas) + Dom (0 linhas)`);
}

// Pré-popular uma semana com dias + 20 linhas/dia
function prePopulateWeek(weekNumber) {
    // Encontrar todos os dias do ano que pertencem a essa semana
    const monthIndex = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
    }[currentMonth];
    
    const firstDay = new Date(currentYear, monthIndex, 1);
    const lastDay = new Date(currentYear, monthIndex + 1, 0);
    
    const daysInWeek = [];
    
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        if (getWeekNumber(d) === weekNumber) {
            daysInWeek.push(new Date(d));
        }
    }
    
    // Para cada dia, adicionar linhas baseado no dia da semana
    daysInWeek.forEach(date => {
        const dateStr = `${String(date.getDate()).padStart(2, '0')}/${currentMonth}`;
        const dayOfWeek = date.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sábado
        
        // Determinar número de linhas
        let numLines = 0;
        if (dayOfWeek === 0) {
            numLines = 0; // Domingo
        } else if (dayOfWeek === 6) {
            numLines = 5; // Sábado
        } else {
            numLines = 20; // Segunda a Sexta
        }
        
        for (let i = 0; i < numLines; i++) {
            encomendasData.dates.push(dateStr);
        }
    });
    
    console.log(`📅 Pré-populada semana ${weekNumber} com ${daysInWeek.length} dias (Seg-Sex: 20, Sáb: 5, Dom: 0)`);
}

// Filtrar dados apenas da semana ativa
function getWeekData() {
    if (!currentWeek) return encomendasData;
    
    const filtered = {
        fields: encomendasData.fields,
        dates: [],
        data: {}
    };
    
    // Filtrar apenas datas que pertencem à semana ativa
    encomendasData.dates.forEach((date, index) => {
        const weekNum = getWeekNumberFromDateStr(date);
        
        if (weekNum === currentWeek) {
            filtered.dates.push(date);
            
            // Copiar dados das células
            encomendasData.fields.forEach(field => {
                const cellKey = `${index}_${field.key}`;
                if (encomendasData.data[cellKey]) {
                    const newIndex = filtered.dates.length - 1;
                    const newKey = `${newIndex}_${field.key}`;
                    filtered.data[newKey] = encomendasData.data[cellKey];
                }
            });
        }
    });
    
    return filtered;
}

// Obter número da semana a partir de string de data (ex: "05/mar")
function getWeekNumberFromDateStr(dateStr) {
    const [day, monthAbbr] = dateStr.split('/');
    
    const monthIndex = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
    }[monthAbbr];
    
    const date = new Date(currentYear, monthIndex, parseInt(day));
    
    return getWeekNumber(date);
}

// Obter número da semana de um Date object (ISO 8601)
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// Adicionar linha de sub-total no final de cada dia
function addSubtotalRow(tbody, date, total, rowIndex) {
    const tr = document.createElement('tr');
    tr.className = 'excel-subtotal-row';
    
    // Encontrar índice da coluna QTD
    const qtdFieldIndex = encomendasData.fields.findIndex(f => f.key === 'qtd');
    
    // Se não há coluna QTD, não adicionar sub-total
    if (qtdFieldIndex === -1) return;
    
    // Criar células até chegar à coluna QTD
    // Primeira célula: Data (label sub-total)
    const dateTh = document.createElement('th');
    dateTh.className = 'excel-subtotal-label';
    dateTh.textContent = `━━ Sub-total ━━`;
    dateTh.style.textAlign = 'center';
    dateTh.style.color = '#4472C4';
    dateTh.style.fontWeight = '700';
    dateTh.style.background = '#F5F5F7';
    dateTh.style.borderTop = '2px solid #4472C4';
    tr.appendChild(dateTh);
    
    // Células vazias até QTD
    encomendasData.fields.forEach((field, index) => {
        const td = document.createElement('td');
        td.className = 'excel-subtotal-cell';
        td.style.background = '#F5F5F7';
        td.style.borderTop = '2px solid #4472C4';
        
        if (field.key === 'qtd') {
            // Célula QTD: mostrar total
            td.className = 'excel-subtotal-value';
            td.textContent = total;
            td.style.background = '#E7E6E6';
            td.style.color = '#1D1D1F';
            td.style.fontWeight = '700';
            td.style.fontSize = '13px';
            td.style.textAlign = 'center';
        } else {
            // Células vazias
            td.textContent = '';
        }
        
        tr.appendChild(td);
    });
    
    tbody.appendChild(tr);
}

// Adicionar linha de sub-total por semana
// Função para adicionar linha de espaçamento vazia
function addSpacerRow(tbody) {
    const spacerRow = document.createElement('tr');
    spacerRow.className = 'excel-spacer-row';
    spacerRow.style.height = '8px';
    spacerRow.style.background = 'transparent';
    spacerRow.style.border = 'none';
    
    const spacerTd = document.createElement('td');
    spacerTd.colSpan = encomendasData.fields.length + 1;
    spacerTd.style.border = 'none';
    spacerTd.style.background = 'transparent';
    spacerRow.appendChild(spacerTd);
    
    tbody.appendChild(spacerRow);
}

// Função para adicionar subtotal por DIA
function addDaySubtotal(tbody, dateStr, rowCount, qtdSum) {
    const subtotalRow = document.createElement('tr');
    subtotalRow.className = 'excel-day-subtotal';
    subtotalRow.style.background = '#E2EFDA';
    subtotalRow.style.fontWeight = '600';
    subtotalRow.style.borderTop = '1px solid #A0C4E8';
    subtotalRow.style.borderBottom = '1px solid #A0C4E8';
    
    // Primeira célula: Label "📅 01/mar"
    const labelTh = document.createElement('th');
    labelTh.style.background = '#E2EFDA';
    labelTh.style.color = '#2F5233';
    labelTh.style.fontWeight = '700';
    labelTh.style.padding = '8px 12px';
    labelTh.style.textAlign = 'center';
    labelTh.style.fontSize = '11px';
    labelTh.textContent = `📅 ${dateStr}`;
    subtotalRow.appendChild(labelTh);
    
    // Outras células: mostrar contador e soma
    encomendasData.fields.forEach(field => {
        const td = document.createElement('td');
        td.className = 'excel-subtotal-cell';
        td.style.background = '#E2EFDA';
        td.style.fontWeight = '600';
        td.style.fontSize = '11px';
        td.style.textAlign = 'center';
        td.style.padding = '6px';
        td.style.border = '1px solid #A0C4E8';
        
        if (field.key === 'local') {
            // Coluna LOCAL: mostrar contador de cargas
            td.textContent = `${rowCount} cargas`;
            td.style.color = '#0066CC';
            td.style.fontWeight = '600';
        } else if (field.key === 'qtd') {
            // Coluna QTD: mostrar soma
            td.textContent = qtdSum.toFixed(0);
            td.style.color = '#0066CC';
            td.style.fontWeight = '700';
            td.style.fontSize = '12px';
        } else {
            // Outras colunas: vazio
            td.textContent = '';
        }
        
        subtotalRow.appendChild(td);
    });
    
    tbody.appendChild(subtotalRow);
}

function addWeekSubtotal(tbody, weekNum, rowCount, qtdSum) {
    const subtotalRow = document.createElement('tr');
    subtotalRow.className = 'excel-week-subtotal';
    subtotalRow.style.background = '#E2EFDA';
    subtotalRow.style.fontWeight = '600';
    subtotalRow.style.borderTop = '2px solid #4472C4';
    subtotalRow.style.borderBottom = '2px solid #4472C4';
    
    // Primeira célula: Label "Sub-total Semana X"
    const labelTh = document.createElement('th');
    labelTh.style.background = '#E2EFDA';
    labelTh.style.color = '#2F5233';
    labelTh.style.fontWeight = '700';
    labelTh.style.padding = '10px 12px';
    labelTh.style.textAlign = 'center';
    labelTh.style.fontSize = '12px';
    labelTh.textContent = `📊 Semana ${weekNum}`;
    subtotalRow.appendChild(labelTh);
    
    // Outras células: mostrar contador e soma
    encomendasData.fields.forEach(field => {
        const td = document.createElement('td');
        td.className = 'excel-subtotal-cell';
        td.style.background = '#E2EFDA';
        td.style.fontWeight = '600';
        td.style.fontSize = '12px';
        td.style.textAlign = 'center';
        td.style.padding = '8px';
        td.style.border = '1px solid #A0C4E8';
        
        if (field.key === 'local') {
            // Coluna LOCAL: mostrar contador de cargas
            td.textContent = `${rowCount} cargas`;
            td.style.color = '#0066CC';
            td.style.fontWeight = '600';
        } else if (field.key === 'qtd') {
            // Coluna QTD: mostrar soma
            td.textContent = qtdSum.toFixed(0);
            td.style.color = '#0066CC';
            td.style.fontWeight = '700';
            td.style.fontSize = '13px';
        } else {
            // Outras colunas: vazio
            td.textContent = '';
        }
        
        subtotalRow.appendChild(td);
    });
    
    tbody.appendChild(subtotalRow);
}

function renderEncomendasGrid() {
    try {
        const table = document.getElementById('encomendas-grid');
        if (!table) {
            console.error('❌ Elemento #encomendas-grid não encontrado!');
            return;
        }
        
        // Filtrar dados pela semana ativa (se houver)
        let datesToRender = encomendasData.dates;
        let dataToRender = encomendasData.data;
        
        if (currentWeek !== null) {
            console.log(`📊 Filtrando dados pela semana ${currentWeek}`);
            
            const filtered = [];
            const filteredData = {};
            
            encomendasData.dates.forEach((date, originalIndex) => {
                const weekNum = getWeekNumberFromDateStr(date);
                
                if (weekNum === currentWeek) {
                    const newIndex = filtered.length;
                    filtered.push(date);
                    
                    // Copiar dados desta linha
                    encomendasData.fields.forEach(field => {
                        const oldKey = `${originalIndex}_${field.key}`;
                        const newKey = `${newIndex}_${field.key}`;
                        if (encomendasData.data[oldKey]) {
                            filteredData[newKey] = encomendasData.data[oldKey];
                        }
                    });
                }
            });
            
            datesToRender = filtered;
            dataToRender = filteredData;
            
            console.log(`   ✅ Filtrado: ${datesToRender.length} linhas da semana ${currentWeek}`);
        }
        
        console.log(`📊 Renderizando grid:`, {
            dates: datesToRender.length,
            fields: encomendasData.fields.length,
            data: Object.keys(dataToRender).length
        });
        
        if (!datesToRender || datesToRender.length === 0) {
            console.warn('⚠️ Nenhuma data para renderizar!');
            table.innerHTML = '<tbody><tr><td colspan="10" style="text-align:center;padding:40px;">Nenhum dado disponível para esta semana</td></tr></tbody>';
            return;
        }
        
        table.innerHTML = '';
    
    // HEADER: Campos nas COLUNAS
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Primeira célula: "Data"
    const dateTh = document.createElement('th');
    dateTh.className = 'excel-header-corner';
    dateTh.textContent = 'Data';
    dateTh.style.background = '#BFBFBF';
    dateTh.style.color = 'white';
    dateTh.style.fontWeight = '700';
    dateTh.style.position = 'sticky';
    dateTh.style.top = '0';
    dateTh.style.zIndex = '100';
    headerRow.appendChild(dateTh);
    
    // Cabeçalhos de campos (colunas)
    encomendasData.fields.forEach(field => {
        const th = document.createElement('th');
        th.className = 'excel-field-header';
        th.textContent = field.label;
        th.style.background = '#BFBFBF';
        th.style.color = 'white';
        th.style.fontWeight = '700';
        th.style.textAlign = 'center';
        th.style.padding = '10px 12px';
        th.style.position = 'sticky';
        th.style.top = '0';
        th.style.zIndex = '100';
        th.style.minWidth = field.width || '120px';
        th.style.fontSize = '11px';
        th.style.whiteSpace = 'nowrap';
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // BODY: Datas nas LINHAS
    const tbody = document.createElement('tbody');
    
    // Variáveis para sub-total por semana e por dia
    let currentWeekNum = null;
    let weekRowCount = 0;
    let weekQtdSum = 0;
    
    let currentDate = null;
    let dayRowCount = 0;
    let dayQtdSum = 0;
    
    datesToRender.forEach((date, index) => {
        const weekNum = getWeekNumberFromDateStr(date);
        
        // Se mudou de DIA, adicionar sub-total do dia anterior
        if (currentDate !== null && date !== currentDate) {
            addDaySubtotal(tbody, currentDate, dayRowCount, dayQtdSum);
            addSpacerRow(tbody);
            dayRowCount = 0;
            dayQtdSum = 0;
        }
        
        // Se mudou de semana, adicionar sub-total da semana anterior
        if (currentWeekNum !== null && weekNum !== currentWeekNum) {
            addSpacerRow(tbody);
            addWeekSubtotal(tbody, currentWeekNum, weekRowCount, weekQtdSum);
            addSpacerRow(tbody);
            weekRowCount = 0;
            weekQtdSum = 0;
        }
        
        currentWeekNum = weekNum;
        currentDate = date;
        
        const tr = document.createElement('tr');
        tr.className = 'excel-row';
        tr.setAttribute('data-row-index', index);  // Para identificar linha no Realtime
        
        // Label da data (primeira coluna) com botão de delete
        const dateTh = document.createElement('th');
        dateTh.className = 'excel-date-label';
        dateTh.style.background = 'white';
        dateTh.style.fontWeight = '600';
        dateTh.style.padding = '8px 12px';
        dateTh.style.textAlign = 'center';
        dateTh.style.fontSize = '12px';
        dateTh.style.minWidth = '100px';
        dateTh.style.position = 'relative';
        
        // Botão de inserir (hover) - NOVO
        const insertBtn = document.createElement('button');
        insertBtn.className = 'excel-row-insert';
        insertBtn.innerHTML = '+';
        insertBtn.title = 'Inserir linha abaixo';
        insertBtn.onclick = () => insertRowBelow(index);
        
        // Botão de delete (hover)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'excel-row-delete';
        deleteBtn.innerHTML = '−';
        deleteBtn.title = 'Apagar linha';
        deleteBtn.onclick = () => deleteRow(index);
        
        const dateSpan = document.createElement('span');
        dateSpan.textContent = date;
        dateSpan.style.display = 'block';
        dateSpan.style.textAlign = 'center';
        dateSpan.style.width = '100%';
        
        dateTh.appendChild(insertBtn);  // NOVO: botão + primeiro
        dateTh.appendChild(deleteBtn);
        dateTh.appendChild(dateSpan);
        tr.appendChild(dateTh);
        
        // Calcular semana automaticamente para a primeira célula (SEM)
        const weekNumber = getWeekNumberFromDateStr(date);
        const semCellKey = `${index}_sem`;  // USAR INDEX em vez de date
        if (!encomendasData.data[semCellKey]) {
            encomendasData.data[semCellKey] = weekNumber.toString();
        }
        
        // Células editáveis para cada campo
        encomendasData.fields.forEach(field => {
            const cellKey = `${index}_${field.key}`;  // USAR INDEX em vez de date
            const value = dataToRender[cellKey] || '';
            
            const td = document.createElement('td');
            td.className = 'excel-cell';
            td.contentEditable = 'true';
            td.setAttribute('data-row-index', index);  // Adicionar index
            td.setAttribute('data-date', date);
            td.setAttribute('data-field', field.key);
            td.textContent = value;
            td.style.background = field.color;
            td.style.border = '1px solid #D0D0D0';
            td.style.padding = '6px 8px';
            td.style.fontSize = '11px';
            td.style.minHeight = '28px';
            td.style.minWidth = field.width || '120px';
            
            // Auto-save on blur
            td.addEventListener('blur', () => {
                const oldValue = encomendasData.data[cellKey] || '';
                const newValue = td.textContent.trim();
                
                if (oldValue !== newValue) {
                    encomendasData.data[cellKey] = newValue;
                    console.log('💾 Atualizado:', cellKey, '=', newValue);
                    
                    // Registar no histórico
                    logHistory('UPDATE', {
                        date: date,
                        field_name: field.key,
                        old_value: oldValue,
                        new_value: newValue,
                        row_order: index
                    });
                    
                    // NOVO: Adicionar à fila de saves (com debouncing)
                    queueSave(index, field.key, newValue);
                }
            });
            
            // Foco visual + tracking de presença
            td.addEventListener('focus', () => {
                td.style.outline = '2px solid #007AFF';
                td.style.outlineOffset = '-2px';
                
                // 👥 FASE 3: Notificar outros utilizadores que estou a editar esta célula
                updateMyActiveCell(index, field.key);
            });
            
            td.addEventListener('blur', () => {
                td.style.outline = 'none';
                
                // 👥 FASE 3: Limpar indicador de célula ativa
                clearMyActiveCell();
            });
            
            // ⌨️ NAVEGAÇÃO COM SETAS (estilo Excel)
            td.addEventListener('keydown', (e) => {
                // Permitir navegação com setas
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab'].includes(e.key)) {
                    e.preventDefault();
                    
                    const currentRow = parseInt(td.getAttribute('data-row-index'));
                    const currentField = td.getAttribute('data-field');
                    const currentFieldIndex = encomendasData.fields.findIndex(f => f.key === currentField);
                    
                    let nextRow = currentRow;
                    let nextFieldIndex = currentFieldIndex;
                    
                    // Determinar próxima célula
                    if (e.key === 'ArrowUp') {
                        nextRow = Math.max(0, currentRow - 1);
                    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                        nextRow = Math.min(datesToRender.length - 1, currentRow + 1);
                    } else if (e.key === 'ArrowLeft') {
                        nextFieldIndex = Math.max(0, currentFieldIndex - 1);
                    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
                        nextFieldIndex = Math.min(encomendasData.fields.length - 1, currentFieldIndex + 1);
                    }
                    
                    // Encontrar e focar na próxima célula
                    const nextField = encomendasData.fields[nextFieldIndex];
                    const nextCell = document.querySelector(
                        `.excel-cell[data-row-index="${nextRow}"][data-field="${nextField.key}"]`
                    );
                    
                    if (nextCell) {
                        nextCell.focus();
                        // Selecionar todo o texto (estilo Excel)
                        const range = document.createRange();
                        range.selectNodeContents(nextCell);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            });
            
            // Contar para sub-total se campo é QTD
            if (field.key === 'qtd' && value) {
                const qtdValue = parseFloat(value) || 0;
                weekQtdSum += qtdValue;
                dayQtdSum += qtdValue;
            }
            
            tr.appendChild(td);
        });
        
        // Contar linha preenchida APENAS se campo LOCAL estiver preenchido
        const localCellKey = `${index}_local`;
        const hasLocal = dataToRender[localCellKey] && dataToRender[localCellKey].trim() !== '';
        
        if (hasLocal) {
            weekRowCount++;
            dayRowCount++;
        }
        
        tbody.appendChild(tr);
    });
    
    // Adicionar sub-total do último dia
    if (currentDate !== null && dayRowCount > 0) {
        addDaySubtotal(tbody, currentDate, dayRowCount, dayQtdSum);
        addSpacerRow(tbody);
    }
    
    // Adicionar sub-total da última semana
    if (currentWeekNum !== null) {
        addSpacerRow(tbody);
        addWeekSubtotal(tbody, currentWeekNum, weekRowCount, weekQtdSum);
        addSpacerRow(tbody);
    }
    
    // Adicionar linha especial com botão "+" no final
    const addRow = document.createElement('tr');
    addRow.className = 'excel-add-row';
    
    const addTh = document.createElement('th');
    addTh.colSpan = 1;
    addTh.style.textAlign = 'center';
    addTh.style.padding = '8px';
    addTh.style.background = '#F9F9F9';
    
    const addBtn = document.createElement('button');
    addBtn.className = 'excel-row-add';
    addBtn.innerHTML = '+';
    addBtn.title = 'Adicionar linha';
    addBtn.onclick = addNewRow;
    
    addTh.appendChild(addBtn);
    addRow.appendChild(addTh);
    
    // Células vazias para as outras colunas
    encomendasData.fields.forEach(() => {
        const emptyTd = document.createElement('td');
        emptyTd.style.background = '#F9F9F9';
        emptyTd.style.border = '1px solid #D0D0D0';
        addRow.appendChild(emptyTd);
    });
    
    tbody.appendChild(addRow);
    
    table.appendChild(tbody);
    
    console.log('✅ Grid renderizado com sucesso!');
    
    } catch (error) {
        console.error('❌ ERRO ao renderizar grid:', error);
        console.error('Stack trace:', error.stack);
        
        // Mostrar erro na interface
        const table = document.getElementById('encomendas-grid');
        if (table) {
            table.innerHTML = `
                <tbody>
                    <tr>
                        <td colspan="10" style="text-align:center;padding:40px;color:#DC3545;">
                            <strong>❌ Erro ao carregar dados</strong><br>
                            ${error.message}<br>
                            <small>Verifique o console (F12) para mais detalhes</small>
                        </td>
                    </tr>
                </tbody>
            `;
        }
    }
}

// Carregar dados do mês da BD
async function loadEncomendasData() {
    console.log('📥 Carregando encomendas para:', currentMonth + '/' + currentYear);
    
    try {
        const { data, error } = await db
            .from('mapa_encomendas')
            .select('*')
            .eq('month', currentMonth)
            .eq('year', currentYear);
        
        if (error) {
            console.warn('⚠️ Erro ao carregar da BD:', error);
            throw error;
        }
        
        if (data && data.length > 0) {
            console.log(`✅ Carregados ${data.length} registros da BD`);
            
            // Ordenar por row_order
            data.sort((a, b) => a.row_order - b.row_order);
            
            // Reconstruir dates e data
            encomendasData.dates = [];
            encomendasData.data = {};
            
            data.forEach((row, rowIndex) => {
                encomendasData.dates.push(row.date);
                
                // Carregar dados das células usando INDEX
                encomendasData.fields.forEach(field => {
                    const cellKey = `${rowIndex}_${field.key}`;
                    if (row[field.key]) {
                        encomendasData.data[cellKey] = row[field.key];
                    }
                });
            });
        } else {
            console.log('📅 Mês vazio. Pré-populando com estrutura completa...');
            
            // Pré-popular o mês com estrutura completa
            prePopulateMonth();
            
            console.log(`📊 Total de linhas geradas: ${encomendasData.dates.length}`);
            console.log(`📊 Primeira data: ${encomendasData.dates[0]}, Última data: ${encomendasData.dates[encomendasData.dates.length - 1]}`);
            
            // Salvar no Supabase
            await saveAllRows();
            
            console.log('✅ Pré-população concluída e salva na BD');
        }
        
    } catch (error) {
        console.error('❌ Erro fatal ao carregar:', error);
        
        // Fallback: dados mínimos
        encomendasData.dates = ['01/' + currentMonth, '01/' + currentMonth, '01/' + currentMonth];
        encomendasData.data = {
            '0_sem': '10',
            '1_sem': '10', 
            '2_sem': '10'
        };
    }
    
    // SEMPRE renderizar (mesmo com erro)
    console.log(`📊 Renderizando grid com ${encomendasData.dates.length} linhas`);
    
    try {
        generateWeekTabs();
    } catch (e) {
        console.error('❌ Erro ao gerar tabs:', e);
    }
    
    try {
        renderEncomendasGrid();
    } catch (e) {
        console.error('❌ Erro ao renderizar grid:', e);
    }
}

// ===================================================================
// FASE 1: SAVE POR LINHA COM DEBOUNCING
// ===================================================================

// Adicionar alteração à fila de saves (com debouncing)
function queueSave(rowIndex, fieldKey, value) {
    // Obter dados existentes da linha ou criar novo objeto
    if (!saveQueue.has(rowIndex)) {
        saveQueue.set(rowIndex, { fields: {}, timestamp: Date.now() });
    }
    
    const rowData = saveQueue.get(rowIndex);
    rowData.fields[fieldKey] = value;
    rowData.timestamp = Date.now();
    
    console.log('📦 Adicionado à fila:', `linha ${rowIndex}, campo ${fieldKey}`);
    
    // Debounce: esperar 1 segundo de inatividade antes de processar
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        processSaveQueue();
    }, SAVE_DEBOUNCE_MS);
}

// Processar fila de saves (salvar todas as linhas pendentes)
async function processSaveQueue() {
    if (saveQueue.size === 0 || isSaving) return;
    
    isSaving = true;
    const rowsToSave = Array.from(saveQueue.entries());
    saveQueue.clear(); // Limpar fila imediatamente
    
    console.log('💾 Processando fila:', rowsToSave.length, 'linha(s)');
    
    try {
        // Salvar cada linha
        for (const [rowIndex, rowData] of rowsToSave) {
            await saveRowData(rowIndex, rowData.fields);
        }
        
        showToast(`✅ ${rowsToSave.length} linha(s) salva(s) no Supabase`, 'success');
    } catch (error) {
        console.error('❌ Erro ao processar fila:', error);
        showToast('❌ Erro ao salvar. Dados mantidos em memória.', 'error');
        
        // Re-adicionar à fila em caso de erro
        rowsToSave.forEach(([rowIndex, rowData]) => {
            saveQueue.set(rowIndex, rowData);
        });
    } finally {
        isSaving = false;
    }
}

// Salvar dados de UMA linha específica (UPSERT)
async function saveRowData(rowIndex, fields) {
    try {
        const date = encomendasData.dates[rowIndex];
        
        if (!date) {
            console.warn('⚠️ Linha', rowIndex, 'não existe');
            return;
        }
        
        // 1. Verificar se linha já existe
        const { data: existing, error: selectError } = await db
            .from('mapa_encomendas')
            .select('id')
            .eq('month', currentMonth)
            .eq('year', currentYear)
            .eq('row_order', rowIndex)
            .maybeSingle();
        
        if (selectError) {
            console.error('❌ Erro ao verificar linha:', selectError);
            throw selectError;
        }
        
        // Preparar dados para salvar
        const rowData = {
            month: currentMonth,
            year: currentYear,
            date: date,
            row_order: rowIndex,
            updated_at: new Date().toISOString(),
            ...fields
        };
        
        if (existing) {
            // 2. UPDATE linha existente
            const { error: updateError } = await db
                .from('mapa_encomendas')
                .update(rowData)
                .eq('id', existing.id);
            
            if (updateError) {
                console.error('❌ Erro ao atualizar linha:', updateError);
                throw updateError;
            }
            
            console.log('✅ Linha', rowIndex, 'atualizada');
        } else {
            // 3. INSERT linha nova
            const { error: insertError } = await db
                .from('mapa_encomendas')
                .insert([rowData]);
            
            if (insertError) {
                console.error('❌ Erro ao inserir linha:', insertError);
                throw insertError;
            }
            
            console.log('✅ Linha', rowIndex, 'inserida');
        }
    } catch (error) {
        console.error('❌ Erro em saveRowData:', error);
        throw error;
    }
}

// Salvar todas as linhas (usado em operações que afetam múltiplas linhas)
async function saveAllRows() {
    console.log('💾 Salvando todas as linhas...');
    
    try {
        // 1. Apagar todas as linhas do mês atual
        const { error: deleteError } = await db
            .from('mapa_encomendas')
            .delete()
            .eq('month', currentMonth)
            .eq('year', currentYear);
        
        if (deleteError) {
            console.warn('⚠️ Erro ao deletar:', deleteError);
        }
        
        // 2. Preparar todas as linhas para inserir
        const rows = encomendasData.dates.map((date, index) => {
            const row = {
                month: currentMonth,
                year: currentYear,
                date: date,
                row_order: index
            };
            
            // Coletar dados de todas as células da linha
            encomendasData.fields.forEach(field => {
                const cellKey = `${index}_${field.key}`;
                row[field.key] = encomendasData.data[cellKey] || '';
            });
            
            return row;
        });
        
        // 3. Inserir todas as linhas
        if (rows.length > 0) {
            const { error: insertError } = await db
                .from('mapa_encomendas')
                .insert(rows);
            
            if (insertError) {
                console.error('❌ Erro ao inserir:', insertError);
                throw insertError;
            }
        }
        
        console.log('✅ Todas as linhas salvas no Supabase');
    } catch (error) {
        console.error('❌ Erro ao salvar todas as linhas:', error);
        throw error;
    }
}

// ===================================================================
// FUNÇÕES ANTIGAS (manter por compatibilidade)
// ===================================================================

// Salvar dados na BD (DEPRECADO - usar queueSave para edições individuais)
// Registar alteração no histórico
async function logHistory(actionType, details = {}) {
    if (!currentUser) return;
    
    try {
        const historyRecord = {
            timestamp: new Date().toISOString(),
            user_id: currentUser.id,
            user_email: currentUser.email,
            action_type: actionType,
            month: currentMonth,
            year: currentYear,
            date: details.date || '',
            field_name: details.field_name || '',
            old_value: details.old_value || '',
            new_value: details.new_value || '',
            row_order: details.row_order || 0,
            details: JSON.stringify(details)
        };
        
        const { error } = await db
            .from('mapa_encomendas_historico')
            .insert([historyRecord]);
        
        if (error) throw error;
        
        console.log('📝 Histórico registado:', actionType, details);
    } catch (error) {
        console.warn('⚠️ Erro ao registar histórico:', error);
    }
}

async function saveEncomendasData() {
    try {
        // Apagar dados antigos do mês usando Supabase
        const { error: deleteError } = await db
            .from('mapa_encomendas')
            .delete()
            .eq('month', currentMonth)
            .eq('year', currentYear);
        
        if (deleteError) {
            console.warn('⚠️ Erro ao deletar:', deleteError);
        }
        
        // Preparar linhas para inserir
        const rows = encomendasData.dates.map((date, index) => {
            const row = {
                month: currentMonth,
                year: currentYear,
                date: date,
                row_order: index
            };
            
            // Coletar dados das células usando INDEX
            encomendasData.fields.forEach(field => {
                const cellKey = `${index}_${field.key}`;  // USAR index
                row[field.key] = encomendasData.data[cellKey] || '';
            });
            
            return row;
        });
        
        // Inserir novas linhas usando Supabase diretamente
        console.log('💾 Salvando', rows.length, 'linhas no Supabase...');
        
        const { error } = await db
            .from('mapa_encomendas')
            .insert(rows);
        
        if (error) throw error;
        
        console.log('✅ Encomendas salvas no Supabase!');
    } catch (error) {
        console.error('❌ Erro ao salvar encomendas:', error);
        console.warn('💡 Dados mantidos em memória.');
    }
}

// ===================================================================
// FASE 2: SUPABASE REALTIME - SINCRONIZAÇÃO TEMPO REAL
// ===================================================================

// Configurar Realtime para o Mapa de Encomendas
function setupEncomendasRealtime() {
    // Cleanup: desconectar canal anterior se existir
    if (realtimeChannel) {
        console.log('🔌 Desconectando canal Realtime anterior...');
        db.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    
    console.log('📡 Ativando Realtime para:', currentMonth, '/', currentYear);
    
    // Criar novo canal
    realtimeChannel = db.channel(`mapa-encomendas-${currentMonth}-${currentYear}`)
        .on('postgres_changes', 
            { 
                event: '*',  // Todos: INSERT, UPDATE, DELETE
                schema: 'public', 
                table: 'mapa_encomendas',
                filter: `month=eq.${currentMonth},year=eq.${currentYear}`
            }, 
            handleRealtimeChange
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                isRealtimeActive = true;
                console.log('✅ Realtime ativo!');
                showToast('📡 Sincronização em tempo real ativa', 'info');
            } else if (status === 'CHANNEL_ERROR') {
                console.error('❌ Erro ao conectar Realtime');
                isRealtimeActive = false;
            } else if (status === 'CLOSED') {
                isRealtimeActive = false;
                console.log('🔌 Realtime desconectado');
            }
        });
}

// Handler para alterações recebidas via Realtime
function handleRealtimeChange(payload) {
    console.log('📡 Alteração recebida:', payload.eventType, payload);
    
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const row = payload.new;
        const rowIndex = row.row_order;
        
        console.log('💾 Atualizando linha', rowIndex, 'localmente');
        
        // Atualizar dados locais
        if (!encomendasData.dates[rowIndex]) {
            encomendasData.dates[rowIndex] = row.date;
        } else {
            encomendasData.dates[rowIndex] = row.date;
        }
        
        // Atualizar células
        encomendasData.fields.forEach(field => {
            const cellKey = `${rowIndex}_${field.key}`;
            if (row[field.key] !== undefined) {
                encomendasData.data[cellKey] = row[field.key];
            }
        });
        
        // Atualizar visualmente apenas essa linha
        updateSingleRow(rowIndex);
        
        // Toast discreto (não mostrar se for a própria alteração)
        if (!isSaving) {
            showToast(`📡 Linha ${rowIndex + 1} atualizada por outro utilizador`, 'info');
        }
    }
    
    if (payload.eventType === 'DELETE') {
        console.log('📡 Linha apagada por outro utilizador');
        showToast('📡 Dados alterados. A recarregar...', 'warning');
        
        // Recarregar todos os dados
        setTimeout(() => {
            loadEncomendasData();
        }, 500);
    }
}

// Atualizar visualmente apenas UMA linha (performance otimizada)
function updateSingleRow(rowIndex) {
    const table = document.getElementById('encomendas-grid');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr.excel-row');
    const row = rows[rowIndex];
    
    if (!row) {
        console.warn('⚠️ Linha', rowIndex, 'não encontrada no DOM');
        return;
    }
    
    // Atualizar cada célula da linha
    const cells = row.querySelectorAll('.excel-cell');
    
    cells.forEach((cell, fieldIndex) => {
        const field = encomendasData.fields[fieldIndex];
        const cellKey = `${rowIndex}_${field.key}`;
        const newValue = encomendasData.data[cellKey] || '';
        
        // Só atualizar se:
        // 1. Valor mudou
        // 2. Utilizador NÃO está a editar essa célula neste momento
        if (cell.textContent !== newValue && document.activeElement !== cell) {
            cell.textContent = newValue;
            
            // Feedback visual: célula pisca verde
            const originalBackground = cell.style.background || field.color;
            
            cell.style.transition = 'background 0.5s ease';
            cell.style.background = '#90EE90';  // Verde claro
            
            setTimeout(() => {
                cell.style.background = originalBackground;
            }, 500);
        }
    });
}

// Desconectar Realtime (cleanup)
function disconnectRealtime() {
    if (realtimeChannel) {
        console.log('🔌 Desconectando Realtime...');
        db.removeChannel(realtimeChannel);
        realtimeChannel = null;
        isRealtimeActive = false;
    }
}

// ===================================================================
// FASE 3: SISTEMA DE PRESENÇA - Indicadores de Utilizadores
// ===================================================================

// Configurar canal de presença
function setupPresence() {
    if (!currentUser) {
        console.warn('⚠️ Sem utilizador - presença não ativada');
        return;
    }
    
    // Cleanup: remover canal anterior
    if (presenceChannel) {
        console.log('👥 Desconectando canal de presença anterior...');
        db.removeChannel(presenceChannel);
        presenceChannel = null;
    }
    
    console.log('👥 Ativando sistema de presença...');
    
    const userColor = getUserColor(currentUser.id);
    
    // Criar canal de presença
    presenceChannel = db.channel(`presence-mapa-encomendas-${currentMonth}-${currentYear}`, {
        config: {
            presence: {
                key: currentUser.id
            }
        }
    });
    
    // Estado inicial do utilizador
    myPresenceState = {
        user_id: currentUser.id,
        user_name: currentUser.email.split('@')[0], // Nome antes do @
        user_email: currentUser.email,
        color: userColor,
        active_cell: null, // {rowIndex, fieldKey}
        last_seen: new Date().toISOString()
    };
    
    // Track presence state (quem está online)
    presenceChannel.on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        console.log('👥 Presença sincronizada:', state);
        
        // Atualizar mapa de utilizadores online
        onlineUsers.clear();
        
        Object.entries(state).forEach(([userId, presences]) => {
            // Cada utilizador pode ter múltiplas presenças (múltiplas tabs)
            // Usar a primeira
            const presence = presences[0];
            if (presence && userId !== currentUser.id) {
                onlineUsers.set(userId, presence);
            }
        });
        
        console.log('👥 Utilizadores online:', onlineUsers.size);
        updateOnlineUsersList();
        updateCellIndicators();
    });
    
    // Join e track
    presenceChannel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('👋 Utilizador entrou:', key, newPresences);
        // showToast(`👋 ${newPresences[0].user_name} entrou`, 'info');  ← DESATIVADO: muito ruído
        updateOnlineUsersList();
    });
    
    presenceChannel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('👋 Utilizador saiu:', key, leftPresences);
        // showToast(`👋 ${leftPresences[0].user_name} saiu`, 'info');  ← DESATIVADO: muito ruído
        updateOnlineUsersList();
        updateCellIndicators();
    });
    
    // Subscribe e fazer track do estado
    presenceChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            console.log('✅ Presença ativa!');
            
            // Enviar estado inicial
            await presenceChannel.track(myPresenceState);
            
            showToast('👥 Sistema de presença ativo', 'success');
        }
    });
}

// Atualizar célula ativa do utilizador atual
async function updateMyActiveCell(rowIndex, fieldKey) {
    if (!presenceChannel || !myPresenceState) return;
    
    currentActiveCell = { rowIndex, fieldKey };
    
    myPresenceState.active_cell = currentActiveCell;
    myPresenceState.last_seen = new Date().toISOString();
    
    try {
        await presenceChannel.track(myPresenceState);
        console.log('📍 Célula ativa atualizada:', rowIndex, fieldKey);
    } catch (error) {
        console.warn('⚠️ Erro ao atualizar presença:', error);
    }
}

// Limpar célula ativa (quando utilizador sai da célula)
async function clearMyActiveCell() {
    if (!presenceChannel || !myPresenceState) return;
    
    currentActiveCell = null;
    myPresenceState.active_cell = null;
    myPresenceState.last_seen = new Date().toISOString();
    
    try {
        await presenceChannel.track(myPresenceState);
        console.log('📍 Célula ativa limpa');
    } catch (error) {
        console.warn('⚠️ Erro ao limpar presença:', error);
    }
}

// Atualizar indicadores visuais nas células
function updateCellIndicators() {
    const table = document.getElementById('encomendas-grid');
    if (!table) return;
    
    // Limpar todos os indicadores anteriores
    table.querySelectorAll('.user-indicator').forEach(el => el.remove());
    table.querySelectorAll('.excel-cell').forEach(cell => {
        cell.style.boxShadow = '';
        cell.style.outline = '';
    });
    
    // Adicionar indicadores para cada utilizador online
    onlineUsers.forEach((presence, userId) => {
        if (!presence.active_cell) return;
        
        const { rowIndex, fieldKey } = presence.active_cell;
        
        // Encontrar a célula no DOM
        const rows = table.querySelectorAll('tbody tr.excel-row');
        const row = rows[rowIndex];
        if (!row) return;
        
        const fieldIndex = encomendasData.fields.findIndex(f => f.key === fieldKey);
        if (fieldIndex === -1) return;
        
        const cells = row.querySelectorAll('.excel-cell');
        const cell = cells[fieldIndex];
        if (!cell) return;
        
        // Adicionar borda colorida
        cell.style.outline = `3px solid ${presence.color}`;
        cell.style.outlineOffset = '-3px';
        cell.style.boxShadow = `0 0 8px ${presence.color}`;
        
        // Adicionar avatar/indicador
        const indicator = document.createElement('div');
        indicator.className = 'user-indicator';
        indicator.style.cssText = `
            position: absolute;
            top: -10px;
            right: -10px;
            width: 24px;
            height: 24px;
            background: ${presence.color};
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: bold;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            z-index: 100;
            pointer-events: none;
        `;
        
        // Iniciais do utilizador
        const initials = presence.user_name.substring(0, 2).toUpperCase();
        indicator.textContent = initials;
        indicator.title = `${presence.user_name} está a editar esta célula`;
        
        // Adicionar ao cell (que precisa de position: relative)
        cell.style.position = 'relative';
        cell.appendChild(indicator);
    });
}

// Atualizar lista de utilizadores online (no topo da página)
function updateOnlineUsersList() {
    let container = document.getElementById('online-users-container');
    
    // Criar container se não existir
    if (!container) {
        const encomendasTab = document.getElementById('tab-encomendas');
        if (!encomendasTab) return;
        
        container = document.createElement('div');
        container.id = 'online-users-container';
        container.style.cssText = `
            background: #F8F9FA;
            border: 1px solid #DEE2E6;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        `;
        
        // Inserir antes da primeira child do tab
        encomendasTab.insertBefore(container, encomendasTab.firstChild);
    }
    
    // Limpar conteúdo
    container.innerHTML = '';
    
    // Label
    const label = document.createElement('span');
    label.style.cssText = 'font-weight: 600; color: #495057;';
    label.textContent = '👥 Online:';
    container.appendChild(label);
    
    // Adicionar utilizador atual (eu)
    if (currentUser) {
        const myBadge = createUserBadge(
            currentUser.email.split('@')[0],
            getUserColor(currentUser.id),
            true // isMe
        );
        container.appendChild(myBadge);
    }
    
    // Adicionar outros utilizadores
    if (onlineUsers.size === 0) {
        const emptyMsg = document.createElement('span');
        emptyMsg.style.cssText = 'color: #6C757D; font-style: italic;';
        emptyMsg.textContent = 'Ninguém mais online';
        container.appendChild(emptyMsg);
    } else {
        onlineUsers.forEach((presence, userId) => {
            const badge = createUserBadge(presence.user_name, presence.color, false);
            container.appendChild(badge);
        });
    }
}

// Criar badge de utilizador
function createUserBadge(name, color, isMe) {
    const badge = document.createElement('div');
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: white;
        border: 2px solid ${color};
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        color: ${color};
        ${isMe ? 'box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.1);' : ''}
    `;
    
    // Indicador de status (círculo verde)
    const dot = document.createElement('span');
    dot.style.cssText = `
        width: 8px;
        height: 8px;
        background: #34A853;
        border-radius: 50%;
        display: inline-block;
    `;
    
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(name + (isMe ? ' (você)' : '')));
    
    return badge;
}

// Desconectar presença (cleanup)
function disconnectPresence() {
    if (presenceChannel) {
        console.log('👥 Desconectando presença...');
        presenceChannel.untrack();
        db.removeChannel(presenceChannel);
        presenceChannel = null;
        onlineUsers.clear();
    }
}

// ===================================================================
// FUNÇÕES DE NAVEGAÇÃO E UTILITÁRIOS
// ===================================================================

// Mudar mês
async function changeMonth(newMonth) {
    console.log('📅 Mudando para mês:', newMonth);
    
    // Desconectar Realtime e Presença do mês anterior
    disconnectRealtime();
    disconnectPresence();
    
    currentMonth = newMonth;
    document.getElementById('month-selector').value = newMonth;
    await loadEncomendasData();
    
    // Reconectar Realtime e Presença para o novo mês
    setupEncomendasRealtime();
    setupPresence();
    
    showToast(`✅ Mês alterado: ${newMonth.toUpperCase()}`);
}

// Calcular número da semana (ISO 8601)
// Apagar linha específica
// Inserir nova linha logo abaixo da linha especificada
async function insertRowBelow(index) {
    const currentDate = encomendasData.dates[index];
    
    console.log(`➕ Inserindo nova linha abaixo de ${currentDate} (índice ${index})`);
    
    // 1. Inserir nova data no array (na posição index + 1)
    encomendasData.dates.splice(index + 1, 0, currentDate);
    
    // 2. Reconstruir o objeto data deslocando todos os índices após a inserção
    const newData = {};
    
    // Copiar dados antes da inserção (índices 0 até index)
    for (let i = 0; i <= index; i++) {
        encomendasData.fields.forEach(field => {
            const key = `${i}_${field.key}`;
            if (encomendasData.data[key] !== undefined) {
                newData[key] = encomendasData.data[key];
            }
        });
    }
    
    // Linha inserida (index + 1) fica vazia, exceto o campo SEM (semana)
    const weekNum = getWeekNumberFromDateStr(currentDate);
    newData[`${index + 1}_sem`] = weekNum.toString();
    
    // Copiar dados depois da inserção (deslocar índices +1)
    for (let i = index + 1; i < encomendasData.dates.length - 1; i++) {
        encomendasData.fields.forEach(field => {
            const oldKey = `${i}_${field.key}`;
            const newKey = `${i + 1}_${field.key}`;
            if (encomendasData.data[oldKey] !== undefined) {
                newData[newKey] = encomendasData.data[oldKey];
            }
        });
    }
    
    encomendasData.data = newData;
    
    // 3. Re-renderizar grid
    renderEncomendasGrid();
    
    // 4. Salvar no Supabase (reindexar todas as linhas)
    await saveAllRows();
    
    // 5. Histórico
    logHistory('INSERT', { date: currentDate, row_order: index + 1 });
    
    showToast(`✅ Nova linha inserida em ${currentDate}`, 'success');
}

async function deleteRow(index) {
    if (encomendasData.dates.length <= 1) {
        showToast('❌ Não pode apagar a última linha!', 'error');
        return;
    }
    
    const date = encomendasData.dates[index];
    
    if (confirm(`Apagar linha ${date}?`)) {
        // Remover a data do array
        encomendasData.dates.splice(index, 1);
        
        // Reconstruir o objeto data com novos índices
        const newData = {};
        encomendasData.dates.forEach((d, newIndex) => {
            encomendasData.fields.forEach(field => {
                const oldKey = `${newIndex >= index ? newIndex + 1 : newIndex}_${field.key}`;
                const newKey = `${newIndex}_${field.key}`;
                if (encomendasData.data[oldKey]) {
                    newData[newKey] = encomendasData.data[oldKey];
                }
            });
        });
        
        encomendasData.data = newData;
        
        logHistory('DELETE', { date: date, row_order: index });
        renderEncomendasGrid();
        
        // Salvar todas as linhas (necessário porque reindexamos)
        await saveAllRows();
        showToast(`✅ Linha ${date} apagada`);
    }
}

// Adicionar novo DIA (20 linhas vazias com a mesma data)
async function addNewDay() {
    const lastDate = encomendasData.dates[encomendasData.dates.length - 1];
    const [day, month] = lastDate.split('/');
    const newDay = (parseInt(day) + 1).toString().padStart(2, '0');
    const newDate = `${newDay}/${month}`;
    
    // Adicionar 20 linhas com a mesma data
    for (let i = 0; i < 20; i++) {
        encomendasData.dates.push(newDate);
    }
    
    logHistory('ADD_DAY', { date: newDate, count: 20 });
    renderEncomendasGrid();
    
    // Salvar todas as linhas novas
    await saveAllRows();
    showToast(`✅ Dia ${newDate} adicionado (20 linhas)`);
}

// Adicionar apenas UMA linha (repete a última data)
async function addNewRow() {
    const lastDate = encomendasData.dates[encomendasData.dates.length - 1];
    encomendasData.dates.push(lastDate);
    logHistory('ADD_ROW', { date: lastDate });
    renderEncomendasGrid();
    
    // Salvar apenas a nova linha
    const newIndex = encomendasData.dates.length - 1;
    await saveRowData(newIndex, {});
    showToast(`✅ Nova linha adicionada (${lastDate})`);
}

// INIT
console.log('🚀 APP.JS CARREGADO - VERSÃO 2.22.6 - FIX: LIMPEZA COMPLETA DO PRESENCE NO LOGOUT - ' + new Date().toLocaleTimeString());

// 🛠️ FUNÇÕES DE DEBUG (chamar do console)
window.debugSecagens = function() {
    console.log('\n═══════════════════════════════════════');
    console.log('🔍 DEBUG: TODAS AS SECAGENS EM MEMÓRIA');
    console.log('═══════════════════════════════════════');
    console.log(`Total: ${secagens.length} secagens\n`);
    
    secagens.forEach((s, idx) => {
        console.log(`${idx + 1}. ID: ${s.id}`);
        console.log(`   Estufa: ${s.estufa_id}`);
        console.log(`   Cliente: ${s.cliente || 'N/A'}`);
        console.log(`   Início: ${formatDateTime(s.start_time)}`);
        console.log(`   Fim: ${formatDateTime(s.end_time)}`);
        console.log(`   Created: ${new Date(s.created_at).toLocaleString()}`);
        console.log('');
    });
    
    console.log('═══════════════════════════════════════\n');
};

window.listarSecagensEstufa = function(estufaId) {
    console.log(`\n🏭 Secagens da Estufa ${estufaId}:`);
    const filtered = secagens.filter(s => s.estufa_id === estufaId);
    console.log(`Total: ${filtered.length}\n`);
    
    filtered.forEach((s, idx) => {
        console.log(`${idx + 1}. ${s.id.slice(0,8)}: ${formatDateTime(s.start_time)} → ${formatDateTime(s.end_time)}`);
    });
};

window.apagarSecagemFantasma = async function(secagemId) {
    console.log(`🗑️ Tentando apagar secagem: ${secagemId}`);
    
    try {
        const { error } = await db
            .from('secagens')
            .delete()
            .eq('id', secagemId);
        
        if (error) throw error;
        
        console.log('✅ Secagem apagada da BD');
        
        // Remover do array em memória
        secagens = secagens.filter(s => s.id !== secagemId);
        console.log('✅ Secagem removida da memória');
        
        // Recarregar dashboard
        await loadAllData();
        console.log('✅ Dashboard recarregado');
        
    } catch (error) {
        console.error('❌ Erro ao apagar:', error);
    }
};

console.log('\n💡 Funções de debug disponíveis:');
console.log('   debugSecagens() - Listar todas as secagens');
console.log('   listarSecagensEstufa(3) - Listar secagens da estufa 3');
console.log('   apagarSecagemFantasma("id-aqui") - Apagar secagem fantasma');
console.log('');
checkAuthState();
initMatrixSystem();
