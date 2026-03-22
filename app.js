import initJolt from 'jolt-physics';

// ========== DOM элементы ==========
const elements = {
    loadingOverlay: document.getElementById('loading-overlay'),
    percent: document.getElementById('percent'),
    progressFill: document.getElementById('progress-fill'),
    stage: document.getElementById('stage'),
    detail: document.getElementById('detail'),
    app: document.getElementById('app'),
    count: document.getElementById('count'),
    stats: document.getElementById('stats'),
    controls: document.getElementById('controls'),
    dragHint: document.querySelector('.drag-hint'),
    gravityToggle: document.getElementById('gravity'),
    showParticles: document.getElementById('showParticles'),
    forceSlider: document.getElementById('force'),
    sizeSlider: document.getElementById('size'),
    randomBtn: document.getElementById('randomBtn'),
    pushBtn: document.getElementById('pushBtn'),
    clearBtn: document.getElementById('clearBtn'),
    resetBtn: document.getElementById('resetBtn'),
    manyBtn: document.getElementById('manyBtn')
};

// ========== Прогресс загрузки ==========
let progress = 0;
function setProgress(value, stageText, detailText) {
    progress = Math.min(99, Math.max(0, value));
    elements.percent.textContent = Math.floor(progress) + '%';
    elements.progressFill.style.width = progress + '%';
    if (stageText) elements.stage.textContent = stageText;
    if (detailText) elements.detail.textContent = detailText;
}

// ========== Глобальные переменные ==========
let Jolt, physicsSystem, bodyInterface, scene, camera, renderer, orbitControls;
let softBody, clothMesh;
let dynamicBodies = [];
let markers = null;
let animationId = null;

// Константы
const LAYER_MOVING = 1;
const LAYER_NON_MOVING = 0;
const COLORS = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0x96ceb4, 0xffcc5c, 0xff6f69, 0x9b59b6, 0x3498db, 0xe67e22, 0x2ecc71];

// ========== Инициализация Three.js ==========
function initThree() {
    setProgress(50, '3D сцена', 'Настройка визуализации');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a2a);
    scene.fog = new THREE.FogExp2(0x0a0a2a, 0.008);
    
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 13, 18);
    camera.lookAt(0, 8, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.zoomSpeed = 1.2;
    
    // Освещение
    const ambient = new THREE.AmbientLight(0x404060);
    scene.add(ambient);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(5, 12, 7);
    mainLight.castShadow = true;
    mainLight.receiveShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);
    
    const fillLight = new THREE.PointLight(0xffaa66, 0.4);
    fillLight.position.set(3, 8, 4);
    scene.add(fillLight);
    
    const backLight = new THREE.PointLight(0x4466cc, 0.3);
    backLight.position.set(-5, 10, -8);
    scene.add(backLight);
    
    // Вспомогательная сетка
    const grid = new THREE.GridHelper(40, 20, 0x88aaff, 0x335588);
    grid.position.y = -0.5;
    scene.add(grid);
}

// ========== Создание физического мира ==========
function initPhysics(joltInstance) {
    Jolt = joltInstance;
    setProgress(65, 'Физический мир', 'Создание симуляции');
    
    const settings = new Jolt.JoltSettings();
    const physSettings = new Jolt.PhysicsSystemSettings();
    physicsSystem = new Jolt.PhysicsSystem(settings, physSettings);
    bodyInterface = physicsSystem.GetBodyInterface();
    physicsSystem.SetGravity(new Jolt.Vec3(0, -9.81, 0));
    
    // Пол
    const floorShape = new Jolt.BoxShape(new Jolt.Vec3(25, 0.5, 25), null);
    const floorSettings = new Jolt.BodyCreationSettings(floorShape, new Jolt.RVec3(0, -1, 0), Jolt.Quat.prototype.sIdentity(), Jolt.EMotionType_Static, LAYER_NON_MOVING);
    const floorBody = bodyInterface.CreateBody(floorSettings);
    
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a5f8a, roughness: 0.6, metalness: 0.1 });
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(50, 1, 50), floorMat);
    floorMesh.position.set(0, -1, 0);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
}

// ========== Создание мягкого тела (ткань) ==========
function createSoftBody() {
    setProgress(75, 'Мягкое тело', 'Построение ткани 40x40');
    
    const gridSize = 40;
    const gridSpacing = 0.5;
    const offset = -0.5 * gridSpacing * (gridSize - 1);
    
    const sharedSettings = new Jolt.SoftBodySharedSettings;
    const vertexIndex = (x, y) => x + y * gridSize;
    
    // Вершины
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            sharedSettings.mVertices.push_back({
                mPosition: new Jolt.Float3(offset + x * gridSpacing, 0, offset + y * gridSpacing)
            });
        }
    }
    
    // Фиксация углов
    sharedSettings.mVertices.at(vertexIndex(0, 0)).mInvMass = 0;
    sharedSettings.mVertices.at(vertexIndex(gridSize - 1, 0)).mInvMass = 0;
    sharedSettings.mVertices.at(vertexIndex(0, gridSize - 1)).mInvMass = 0;
    sharedSettings.mVertices.at(vertexIndex(gridSize - 1, gridSize - 1)).mInvMass = 0;
    
    // Грани (треугольники)
    const face = new Jolt.SoftBodySharedSettingsFace(0, 0, 0, 0);
    for (let y = 0; y < gridSize - 1; y++) {
        for (let x = 0; x < gridSize - 1; x++) {
            face.set_mVertex(0, vertexIndex(x, y));
            face.set_mVertex(1, vertexIndex(x, y + 1));
            face.set_mVertex(2, vertexIndex(x + 1, y + 1));
            sharedSettings.AddFace(face);
            face.set_mVertex(1, vertexIndex(x + 1, y + 1));
            face.set_mVertex(2, vertexIndex(x + 1, y));
            sharedSettings.AddFace(face);
        }
    }
    
    // Ограничения
    const attrs = new Jolt.SoftBodySharedSettingsVertexAttributes();
    attrs.mCompliance = 0.00001;
    attrs.mShearCompliance = 0.00001;
    sharedSettings.CreateConstraints(attrs, 1);
    sharedSettings.Optimize();
    
    // Создание тела
    const creationSettings = new Jolt.SoftBodyCreationSettings(sharedSettings, new Jolt.RVec3(0, 12, 0), Jolt.Quat.prototype.sIdentity());
    creationSettings.mObjectLayer = LAYER_MOVING;
    creationSettings.mUpdatePosition = false;
    softBody = bodyInterface.CreateSoftBody(creationSettings);
    
    // Визуализация ткани
    const clothMaterial = new THREE.MeshStandardMaterial({
        color: 0x88aaff,
        side: THREE.DoubleSide,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85
    });
    clothMesh = new THREE.Mesh(new THREE.PlaneGeometry(19.5, 19.5, 40, 40), clothMaterial);
    clothMesh.rotation.x = -Math.PI / 2;
    clothMesh.position.y = 12;
    clothMesh.castShadow = true;
    clothMesh.receiveShadow = true;
    scene.add(clothMesh);
}

// ========== Управление объектами ==========
function getCurrentSize() {
    return parseFloat(elements.sizeSlider.value);
}

function createObject(type, x, y, z) {
    const size = getCurrentSize();
    let shape;
    
    switch(type) {
        case 'sphere':
            shape = new Jolt.SphereShape(size, null);
            break;
        case 'box':
            shape = new Jolt.BoxShape(new Jolt.Vec3(size, size, size), null);
            break;
        case 'capsule':
            shape = new Jolt.CapsuleShape(size * 1.5, size, null);
            break;
        case 'cylinder':
            shape = new Jolt.CylinderShape(size * 0.8, size, null);
            break;
        case 'cone':
            shape = new Jolt.ConeShape(size * 1.2, size, null);
            break;
        case 'torus':
            shape = new Jolt.TorusShape(size * 1.2, size * 0.3, null);
            break;
        default:
            shape = new Jolt.SphereShape(size, null);
    }
    
    const settings = new Jolt.BodyCreationSettings(shape, new Jolt.RVec3(x, y, z), Jolt.Quat.prototype.sIdentity(), Jolt.EMotionType_Dynamic, LAYER_MOVING);
    settings.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
    settings.mMassPropertiesOverride.mMass = 20 + Math.random() * 80;
    
    const body = bodyInterface.CreateBody(settings);
    
    // Визуализация
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.3 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { body };
    scene.add(mesh);
    body.userData = { mesh };
    
    dynamicBodies.push(body);
    updateStats();
    return body;
}

function addObject(type = null) {
    const types = ['sphere', 'box', 'capsule', 'cylinder', 'cone', 'torus'];
    const selectedType = type || types[Math.floor(Math.random() * types.length)];
    const x = (Math.random() - 0.5) * 14;
    const z = (Math.random() - 0.5) * 14;
    const y = 14 + Math.random() * 6;
    createObject(selectedType, x, y, z);
}

function addRandomObjects(count) {
    for (let i = 0; i < count; i++) {
        setTimeout(() => addObject(), i * 20);
    }
}

function addManyObjects() {
    for (let i = 0; i < 50; i++) {
        setTimeout(() => addObject(), i * 15);
    }
}

function clearAllObjects() {
    dynamicBodies.forEach(body => {
        bodyInterface.RemoveBody(body.GetID());
        bodyInterface.DestroyBody(body);
        if (body.userData?.mesh) scene.remove(body.userData.mesh);
    });
    dynamicBodies = [];
    updateStats();
}

function pushAllObjects() {
    const force = parseFloat(elements.forceSlider.value);
    dynamicBodies.forEach(body => {
        const vel = body.GetLinearVelocity();
        const dir = new Jolt.Vec3(
            (Math.random() - 0.5) * 2,
            Math.random() * 1.5 + 0.5,
            (Math.random() - 0.5) * 2
        ).Normalized();
        const newVel = new Jolt.Vec3(
            vel.GetX() + dir.GetX() * force,
            vel.GetY() + dir.GetY() * force + 30,
            vel.GetZ() + dir.GetZ() * force
        );
        bodyInterface.SetLinearVelocity(body, newVel, Jolt.EActivation_Activate);
    });
}

function resetCloth() {
    bodyInterface.SetPosition(softBody, new Jolt.RVec3(0, 12, 0), Jolt.EActivation_Activate);
    bodyInterface.SetLinearVelocity(softBody, new Jolt.Vec3(0, 0, 0), Jolt.EActivation_Activate);
}

function updateStats() {
    elements.count.textContent = dynamicBodies.length;
    elements.stats.innerHTML = `⚡ Объектов: ${dynamicBodies.length} | 🎪 1600 вершин`;
}

// ========== Анимация и рендеринг ==========
function updateMarkers() {
    if (!elements.showParticles.checked) {
        if (markers) {
            scene.remove(markers);
            markers = null;
        }
        return;
    }
    
    const motionProps = Jolt.castObject(softBody.GetMotionProperties(), Jolt.SoftBodyMotionProperties);
    if (!motionProps) return;
    
    const vertices = motionProps.GetVertices();
    const transform = softBody.GetWorldTransform();
    const points = [];
    
    for (let i = 0; i < vertices.size(); i++) {
        const v = vertices.at(i);
        const pos = transform.Multiply3x3(v.mPosition).Add(transform.GetTranslation());
        const x = pos.GetX(), y = pos.GetY(), z = pos.GetZ();
        points.push(new THREE.Vector3(x - 0.06, y, z));
        points.push(new THREE.Vector3(x + 0.06, y, z));
        points.push(new THREE.Vector3(x, y - 0.06, z));
        points.push(new THREE.Vector3(x, y + 0.06, z));
        points.push(new THREE.Vector3(x, y, z - 0.06));
        points.push(new THREE.Vector3(x, y, z + 0.06));
    }
    
    if (markers) {
        if (markers.geometry) markers.geometry.dispose();
        markers.geometry = new THREE.BufferGeometry().setFromPoints(points);
    } else {
        const material = new THREE.LineBasicMaterial({ color: 0xffaa44 });
        markers = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material);
        scene.add(markers);
    }
}

function animate() {
    animationId = requestAnimationFrame(animate);
    
    if (physicsSystem) {
        physicsSystem.Update(1 / 60, 1, 1, null, null);
    }
    
    // Обновление позиций объектов
    dynamicBodies.forEach(body => {
        if (body.userData?.mesh) {
            const pos = body.GetPosition();
            const rot = body.GetRotation();
            body.userData.mesh.position.set(pos.GetX(), pos.GetY(), pos.GetZ());
            body.userData.mesh.quaternion.set(rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW());
        }
    });
    
    // Обновление ткани (простая визуализация позиции)
    if (clothMesh && softBody) {
        const pos = softBody.GetPosition();
        clothMesh.position.set(pos.GetX(), pos.GetY(), pos.GetZ());
    }
    
    updateMarkers();
    orbitControls.update();
    renderer.render(scene, camera);
}

// ========== Перетаскивание полотна (мышь + тач) ==========
function setupDragging() {
    let isDragging = false;
    let dragStartPos = null;
    let dragStartClothPos = null;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    function getWorldPos(clientX, clientY, planeY = 12) {
        mouse.x = (clientX / renderer.domElement.clientWidth) * 2 - 1;
        mouse.y = -(clientY / renderer.domElement.clientHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), planeY);
        const target = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, target)) return target;
        return null;
    }
    
    function onStart(clientX, clientY) {
        const worldPos = getWorldPos(clientX, clientY, 12);
        if (worldPos && Math.abs(worldPos.y - 12) < 3) {
            isDragging = true;
            dragStartPos = worldPos.clone();
            dragStartClothPos = softBody.GetPosition().Clone();
        }
    }
    
    function onMove(clientX, clientY) {
        if (!isDragging) return;
        const worldPos = getWorldPos(clientX, clientY, 12);
        if (worldPos && dragStartPos) {
            const deltaX = worldPos.x - dragStartPos.x;
            const deltaZ = worldPos.z - dragStartPos.z;
            const newPos = dragStartClothPos.clone();
            newPos.x += deltaX;
            newPos.z += deltaZ;
            newPos.x = Math.max(-10, Math.min(10, newPos.x));
            newPos.z = Math.max(-10, Math.min(10, newPos.z));
            bodyInterface.SetPosition(softBody, new Jolt.RVec3(newPos.x, newPos.y, newPos.z), Jolt.EActivation_Activate);
        }
    }
    
    function onEnd() {
        isDragging = false;
    }
    
    // Мышь
    renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0) onStart(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);
    
    // Тач
    renderer.domElement.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        onStart(touch.clientX, touch.clientY);
    });
    renderer.domElement.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        onMove(touch.clientX, touch.clientY);
    });
    renderer.domElement.addEventListener('touchend', onEnd);
}

// ========== Настройка обработчиков UI ==========
function setupUI() {
    elements.gravityToggle.addEventListener('change', (e) => {
        physicsSystem.SetGravity(e.target.checked ? new Jolt.Vec3(0, -9.81, 0) : new Jolt.Vec3(0, 0, 0));
    });
    
    elements.randomBtn.addEventListener('click', () => addRandomObjects(10));
    elements.pushBtn.addEventListener('click', pushAllObjects);
    elements.clearBtn.addEventListener('click', clearAllObjects);
    elements.resetBtn.addEventListener('click', resetCloth);
    elements.manyBtn.addEventListener('click', addManyObjects);
    
    document.querySelectorAll('[data-type]').forEach(btn => {
        btn.addEventListener('click', () => addObject(btn.dataset.type));
    });
}

// ========== Завершение загрузки ==========
function finishLoading() {
    setProgress(100, 'Готово!', 'Мир загружен');
    setTimeout(() => {
        elements.loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            elements.loadingOverlay.style.display = 'none';
        }, 500);
        elements.app.style.opacity = '1';
        elements.controls.classList.add('visible');
        elements.dragHint.style.opacity = '1';
    }, 300);
}

// ========== Инициализация приложения ==========
async function init() {
    setProgress(5, 'Загрузка Jolt Physics', 'Подключение движка');
    
    // Загрузка Jolt
    const JoltInstance = await initJolt();
    setProgress(40, 'Инициализация', 'Настройка физики');
    
    initThree();
    initPhysics(JoltInstance);
    createSoftBody();
    setupDragging();
    setupUI();
    
    // Добавляем начальные объекты
    setTimeout(() => {
        for (let i = 0; i < 30; i++) {
            setTimeout(() => addObject(), i * 50);
        }
    }, 500);
    
    // Запуск анимации
    animate();
    finishLoading();
}

// Запуск
init().catch(err => {
    console.error('Ошибка:', err);
    elements.detail.textContent = 'Ошибка загрузки. Обновите страницу.';
    elements.detail.style.color = '#ff6b6b';
});
