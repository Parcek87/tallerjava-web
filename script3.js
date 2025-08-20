const API_BASE_URL = 'https://pokeapi.co/api/v2';
const POKEMON_PER_PAGE = 10;

let currentPage = 1;
let totalPokemon = 0;
let pokemonList = [];
let pokemonListFull = [];
let pokemonToTypes = {};
let typesList = [];
let pokemonToGen = {};
let genCount = 0;
let pokemonDetailsCache = {};
let selectedTypes = [];
let selectedGen = '';
let searchQuery = '';
let sortBy = 'id_asc';

const pokemonGrid = document.getElementById('pokemonGrid');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const loading = document.getElementById('loading');
const pokemonModal = document.getElementById('pokemonModal');
const modalTitle = document.getElementById('modalTitle');
const modalContent = document.getElementById('modalContent');
const closeModal = document.getElementById('closeModal');
const searchInput = document.getElementById('searchInput');
const genFilter = document.getElementById('genFilter');
const sortSelect = document.getElementById('sortSelect');
const clearFilters = document.getElementById('clearFilters');
const typeButtons = document.getElementById('typeButtons');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');

document.addEventListener('DOMContentLoaded', init);

async function init() {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/pokemon?limit=2000`);
        const data = await response.json();
        pokemonListFull = data.results;
        pokemonListFull.forEach(p => {
            p.id = parseInt(p.url.split('/').slice(-2, -1)[0]);
        });
        const typesData = await loadTypesData();
        pokemonToTypes = typesData.pokemonToTypes;
        typesList = typesData.typesList;
        const genData = await loadGenerationsData();
        pokemonToGen = genData.pokemonToGen;
        genCount = genData.genCount;

        createTypeButtons();
        createGenOptions();

        applyFiltersAndSort();
        setupEventListeners();
    } catch (error) {
        console.error('Error en inicialización:', error);
        showError('Error al inicializar la aplicación.');
    } finally {
        showLoading(false);
    }
}

async function loadTypesData() {
    const typesResponse = await fetch(`${API_BASE_URL}/type?limit=20`);
    const types = (await typesResponse.json()).results;
    const pokemonToTypes = {};
    for (let type of types) {
        const typeData = await fetch(type.url).then(r => r.json());
        for (let p of typeData.pokemon) {
            const name = p.pokemon.name;
            if (!pokemonToTypes[name]) pokemonToTypes[name] = [];
            pokemonToTypes[name].push(typeData.name);
        }
    }
    const typesList = types.map(t => t.name).sort();
    return { pokemonToTypes, typesList };
}

async function loadGenerationsData() {
    const genResponse = await fetch(`${API_BASE_URL}/generation`);
    const gens = (await genResponse.json()).results;
    const pokemonToGen = {};
    for (let i = 0; i < gens.length; i++) {
        const genData = await fetch(gens[i].url).then(r => r.json());
        const genNum = i + 1;
        for (let species of genData.pokemon_species) {
            pokemonToGen[species.name] = genNum;
        }
    }
    return { pokemonToGen, genCount: gens.length };
}

function createTypeButtons() {
    typesList.forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        btn.classList.add('px-2', 'py-1', 'rounded', 'text-white', getTypeColor(type), 'opacity-50', 'hover:opacity-80');
        btn.dataset.type = type;
        btn.addEventListener('click', () => {
            btn.classList.toggle('opacity-50');
            btn.classList.toggle('selected');
            if (selectedTypes.includes(type)) {
                selectedTypes = selectedTypes.filter(t => t !== type);
            } else {
                selectedTypes.push(type);
            }
            currentPage = 1;
            applyFiltersAndSort();
        });
        typeButtons.appendChild(btn);
    });
}

function createGenOptions() {
    for (let i = 1; i <= genCount; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Generación ${i}`;
        genFilter.appendChild(option);
    }
}

async function applyFiltersAndSort() {
    showLoading(true);
    try {
        let filtered = pokemonListFull.filter(p => {
            if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            const types = pokemonToTypes[p.name] || [];
            if (selectedTypes.length > 0 && !selectedTypes.some(t => types.includes(t))) return false;
            if (selectedGen && pokemonToGen[p.name] !== parseInt(selectedGen)) return false;
            return true;
        });

        // Sorting
        if (sortBy.startsWith('height_') || sortBy.startsWith('weight_')) {
            const missing = filtered.filter(p => !pokemonDetailsCache[p.name]);
            if (missing.length > 0) {
                const promises = missing.map(async (p) => {
                    const d = await fetchPokemonDetails(p.url);
                    pokemonDetailsCache[p.name] = d;
                });
                await Promise.all(promises);
            }

            if (sortBy.startsWith('height_')) {
                filtered.sort((a, b) => {
                    const ha = pokemonDetailsCache[a.name].height;
                    const hb = pokemonDetailsCache[b.name].height;
                    return sortBy === 'height_asc' ? ha - hb : hb - ha;
                });
            } else if (sortBy.startsWith('weight_')) {
                filtered.sort((a, b) => {
                    const wa = pokemonDetailsCache[a.name].weight;
                    const wb = pokemonDetailsCache[b.name].weight;
                    return sortBy === 'weight_asc' ? wa - wb : wb - wa;
                });
            }
        } else if (sortBy.startsWith('id_')) {
            filtered.sort((a, b) => sortBy === 'id_asc' ? a.id - b.id : b.id - a.id);
        } else if (sortBy.startsWith('name_')) {
            filtered.sort((a, b) => {
                const cmp = a.name.localeCompare(b.name);
                return sortBy === 'name_asc' ? cmp : -cmp;
            });
        }

        totalPokemon = filtered.length;
        const offset = (currentPage - 1) * POKEMON_PER_PAGE;
        pokemonList = filtered.slice(offset, offset + POKEMON_PER_PAGE);
        await displayPokemonList();
        updatePaginationControls();
    } catch (error) {
        console.error('Error aplicando filtros y orden:', error);
        showError('Error al aplicar filtros.');
    } finally {
        showLoading(false);
    }
}

async function displayPokemonList() {
    pokemonGrid.innerHTML = '';
    for (let p of pokemonList) {
        let data = pokemonDetailsCache[p.name];
        if (!data) {
            data = await fetchPokemonDetails(p.url);
            pokemonDetailsCache[p.name] = data;
        }
        if (data) {
            const card = createPokemonCard(data);
            pokemonGrid.appendChild(card);
        }
    }
}

async function fetchPokemonDetails(url) {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Error al obtener detalles del Pokémon:', error);
        return null;
    }
}

function createPokemonCard(pokemon) {
    const card = document.createElement('div');
    card.className = 'pokemon-card bg-white rounded-lg shadow-lg p-4 flex flex-col items-center';
    
    card.innerHTML = `
        <span class="text-sm font-medium text-gray-600">ID: #${pokemon.id}</span>
        <img src="${pokemon.sprites.front_default}" 
             alt="${pokemon.name}" 
             class="w-24 h-24 object-contain my-2">
        <h3 class="text-lg font-bold capitalize text-gray-800">${pokemon.name}</h3>
        <div class="flex flex-wrap justify-center gap-1 my-2">
            ${createTypesBadges(pokemon.types)}
        </div>
        <button onclick="showPokemonDetails(${pokemon.id})" 
                class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 mt-2">
            Ver Detalle
        </button>
    `;
    
    return card;
}

function createTypesBadges(types) {
    return types.map(typeInfo => {
        const typeName = typeInfo.type.name;
        const colorClass = getTypeColor(typeName);
        return `<span class="inline-block px-2 py-1 text-xs rounded-full text-white ${colorClass}">
                    ${typeName}
                </span>`;
    }).join('');
}

function getTypeColor(type) {
    const colors = {
        normal: 'bg-gray-400',
        fire: 'bg-red-500',
        water: 'bg-blue-500',
        electric: 'bg-yellow-400',
        grass: 'bg-green-500',
        ice: 'bg-blue-300',
        fighting: 'bg-red-700',
        poison: 'bg-purple-500',
        ground: 'bg-yellow-600',
        flying: 'bg-indigo-400',
        psychic: 'bg-pink-500',
        bug: 'bg-green-400',
        rock: 'bg-yellow-800',
        ghost: 'bg-purple-700',
        dragon: 'bg-indigo-700',
        dark: 'bg-gray-800',
        steel: 'bg-gray-500',
        fairy: 'bg-pink-300'
    };
    return colors[type] || 'bg-gray-400';
}

async function showPokemonDetails(pokemonId) {
    try {
        showLoading(true);
        
        const response = await fetch(`${API_BASE_URL}/pokemon/${pokemonId}`);
        const pokemon = await response.json();
        
        modalTitle.textContent = `#${pokemon.id} ${pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1)}`;
        
        modalContent.innerHTML = `
            <div class="text-center mb-4">
                <img src="${pokemon.sprites.front_default}" 
                     alt="${pokemon.name}" 
                     class="w-32 h-32 mx-auto">
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <h3 class="font-semibold text-gray-700">Altura:</h3>
                    <p>${pokemon.height / 10} m</p>
                </div>
                <div>
                    <h3 class="font-semibold text-gray-700">Peso:</h3>
                    <p>${pokemon.weight / 10} kg</p>
                </div>
            </div>
            
            <div class="mb-4">
                <h3 class="font-semibold text-gray-700 mb-2">Tipos:</h3>
                ${createTypesBadges(pokemon.types)}
            </div>
            
            <div class="mb-4">
                <h3 class="font-semibold text-gray-700 mb-2">Habilidades:</h3>
                <ul class="list-disc list-inside">
                    ${pokemon.abilities.map(ability => 
                        `<li class="capitalize">${ability.ability.name.replace('-', ' ')}</li>`
                    ).join('')}
                </ul>
            </div>
            
            <div>
                <h3 class="font-semibold text-gray-700 mb-2">Estadísticas Base:</h3>
                ${createStatsDisplay(pokemon.stats)}
            </div>
        `;
        
        pokemonModal.classList.remove('hidden');
        pokemonModal.classList.add('flex');
        
    } catch (error) {
        console.error('Error al cargar detalles del Pokémon:', error);
        showError('Error al cargar los detalles del Pokémon.');
    } finally {
        showLoading(false);
    }
}

function createStatsDisplay(stats) {
    return stats.map(stat => {
        const statName = stat.stat.name.replace('-', ' ');
        const statValue = stat.base_stat;
        const percentage = Math.min((statValue / 200) * 100, 100);
        
        return `
            <div class="mb-2">
                <div class="flex justify-between text-sm">
                    <span class="capitalize">${statName}</span>
                    <span>${statValue}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-blue-500 h-2 rounded-full" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function setupEventListeners() {
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            applyFiltersAndSort();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(totalPokemon / POKEMON_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            applyFiltersAndSort();
        }
    });
    
    closeModal.addEventListener('click', () => {
        pokemonModal.classList.add('hidden');
        pokemonModal.classList.remove('flex');
    });
    
    pokemonModal.addEventListener('click', (e) => {
        if (e.target === pokemonModal) {
            pokemonModal.classList.add('hidden');
            pokemonModal.classList.remove('flex');
        }
    });
    
    const debouncedSearch = debounce((value) => {
        searchQuery = value.trim();
        currentPage = 1;
        applyFiltersAndSort();
    }, 300);
    
    searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
    
    genFilter.addEventListener('change', (e) => {
        selectedGen = e.target.value;
        currentPage = 1;
        applyFiltersAndSort();
    });
    
    sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        currentPage = 1;
        applyFiltersAndSort();
    });
    
    clearFilters.addEventListener('click', () => {
        searchQuery = '';
        searchInput.value = '';
        selectedTypes = [];
        typeButtons.querySelectorAll('button').forEach(btn => {
            btn.classList.add('opacity-50');
            btn.classList.remove('selected');
        });
        selectedGen = '';
        genFilter.value = '';
        sortBy = 'id_asc';
        sortSelect.value = 'id_asc';
        currentPage = 1;
        applyFiltersAndSort();
    });
    
    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });
}

function updatePaginationControls() {
    const totalPages = Math.ceil(totalPokemon / POKEMON_PER_PAGE);
    
    pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    
    if (prevBtn.disabled) {
        prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        prevBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    if (nextBtn.disabled) {
        nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function showLoading(show) {
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

function showError(message) {
    alert(message);
}

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}