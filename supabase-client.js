// ================================================
// 🔥 SUPABASE CLIENT - Substitui Google Sheets
// ================================================

// CONFIGURAÇÃO SUPABASE
const SUPABASE_CONFIG = {
    URL: 'https://wegftalccimrnnlmoiyn.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlZ2Z0YWxjY2ltcm5ubG1vaXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDY0MzIsImV4cCI6MjA4MjM4MjQzMn0.0TqEtQnJC7kVQO284C0xvaE_xi2e0zuXpsF1M4ZEw4w'
};

// HELPER: Fetch genérico para Supabase REST API
async function supabaseFetch(endpoint, options = {}) {
    const url = `${SUPABASE_CONFIG.URL}/rest/v1/${endpoint}`;
    const headers = {
        'apikey': SUPABASE_CONFIG.ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...options.headers
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro na API Supabase');
    }

    return response.json();
}

// ================================================
// 📋 ARTIGOS
// ================================================

async function getArtigos() {
    return await supabaseFetch('artigos?select=*&order=ID.asc');
}

async function addArtigo(artigo) {
    return await supabaseFetch('artigos', {
        method: 'POST',
        body: JSON.stringify(artigo)
    });
}

async function updateArtigo(id, artigo) {
    return await supabaseFetch(`artigos?ID=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(artigo)
    });
}

async function deleteArtigo(id) {
    return await supabaseFetch(`artigos?ID=eq.${id}`, {
        method: 'DELETE'
    });
}

// ================================================
// 👥 UTILIZADORES
// ================================================

async function getUtilizadores() {
    return await supabaseFetch('utilizadores?select=*&order=Username.asc');
}

async function loginUtilizador(username, password) {
    const users = await supabaseFetch(`utilizadores?Username=eq.${encodeURIComponent(username)}&Password=eq.${encodeURIComponent(password)}`);
    
    if (users.length === 0) {
        throw new Error('Utilizador ou password incorretos');
    }
    
    return users[0];
}

async function addUtilizador(user) {
    return await supabaseFetch('utilizadores', {
        method: 'POST',
        body: JSON.stringify(user)
    });
}

// ================================================
// 📝 PEDIDOS
// ================================================

async function getPedidos() {
    return await supabaseFetch('pedidos?select=*&order=Data/hora.desc');
}

async function addPedido(pedido) {
    return await supabaseFetch('pedidos', {
        method: 'POST',
        body: JSON.stringify(pedido)
    });
}

async function updatePedido(id, pedido) {
    return await supabaseFetch(`pedidos?ID=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(pedido)
    });
}

async function deletePedido(id) {
    return await supabaseFetch(`pedidos?ID=eq.${id}`, {
        method: 'DELETE'
    });
}

// ================================================
// 📦 MOVIMENTOS
// ================================================

async function getMovimentos() {
    return await supabaseFetch('movimentos?select=*&order=Data/Hora.desc');
}

async function addMovimento(movimento) {
    return await supabaseFetch('movimentos', {
        method: 'POST',
        body: JSON.stringify(movimento)
    });
}

// ================================================
// 📅 PLANEAMENTO
// ================================================

async function getPlaneamento() {
    return await supabaseFetch('planeamento?select=*&order=Data Alocada.asc');
}

async function addPlaneamento(plano) {
    return await supabaseFetch('planeamento', {
        method: 'POST',
        body: JSON.stringify(plano)
    });
}

async function updatePlaneamento(id, plano) {
    return await supabaseFetch(`planeamento?ID=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(plano)
    });
}

async function deletePlaneamento(id) {
    return await supabaseFetch(`planeamento?ID=eq.${id}`, {
        method: 'DELETE'
    });
}

// ================================================
// 📊 LOGS
// ================================================

async function addLog(log) {
    return await supabaseFetch('logs', {
        method: 'POST',
        body: JSON.stringify(log)
    });
}

async function getLogs() {
    return await supabaseFetch('logs?select=*&order=Timestamp.desc&limit=100');
}

// ================================================
// 🔄 EXPORTAR PARA USO GLOBAL
// ================================================

window.SupabaseAPI = {
    // Artigos
    getArtigos,
    addArtigo,
    updateArtigo,
    deleteArtigo,
    
    // Utilizadores
    getUtilizadores,
    loginUtilizador,
    addUtilizador,
    
    // Pedidos
    getPedidos,
    addPedido,
    updatePedido,
    deletePedido,
    
    // Movimentos
    getMovimentos,
    addMovimento,
    
    // Planeamento
    getPlaneamento,
    addPlaneamento,
    updatePlaneamento,
    deletePlaneamento,
    
    // Logs
    addLog,
    getLogs
};

console.log('✅ Supabase API inicializada');
