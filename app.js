// Three.js scene setup
let scene, camera, renderer, cube, sphere, torus, gridHelper;
let video, canvas, ctx;
let faceDetectionRunning = false;
let lastFacePosition = { x: 0, y: 0, z: 60 };
let smoothPosition = { x: 0, y: 0, z: 60 };
let calibrationData = { faceWidth: 14, realDistance: 60 };
let videoVisible = true;

// Parallax intensity control
let parallaxIntensity = 1.0;
let invertAxes = false;

// Distance smoothing buffer
let distanceBuffer = [];
const DISTANCE_BUFFER_SIZE = 10;
const DISTANCE_THRESHOLD = 15; // Ignore distance changes larger than this

// FPS tracking
let frameCount = 0;
let lastTime = Date.now();
let fps = 0;

const MODEL_URL = './models';
const isMobileDevice = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
const detectionOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: isMobileDevice ? 224 : 320,
    scoreThreshold: 0.5
});
const detectionInterval = isMobileDevice ? 80 : 33;

// Initialize Three.js scene
function initThreeJS() {
    const container = document.getElementById('container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = 0;

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('canvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true; // Enable sorting by renderOrder

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x00ff88, 1, 100);
    pointLight1.position.set(10, 10, 10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff0088, 0.8, 100);
    pointLight2.position.set(-10, -10, 10);
    scene.add(pointLight2);

    // Create 3D objects
    createObjects();

    window.addEventListener('resize', onWindowResize);
}

function createObjects() {
    // Edge material for sharp edges
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 2,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });

    // Central rotating cube with outline
    const cubeGeometry = new THREE.BoxGeometry(15, 15, 15);
    const cubeMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff88,
        emissive: 0x004422,
        shininess: 100,
        wireframe: false
    });
    cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(0, 0, 120);
    cube.renderOrder = 999;
    cube.material.transparent = true;
    cube.material.opacity = 0.99;
    cube.material.depthTest = false;
    cube.material.depthWrite = false;
    scene.add(cube);

    // Outline for cube (backside)
    const outlineMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.99,
        depthTest: false,
        depthWrite: false
    });
    const cubeOutline = new THREE.Mesh(new THREE.BoxGeometry(15.5, 15.5, 15.5), outlineMaterial);
    cubeOutline.renderOrder = 998;
    cube.add(cubeOutline);

    // Edge lines for cube - только острые углы
    const cubeEdges = new THREE.EdgesGeometry(cubeGeometry, 40);
    const cubeEdgeLines = new THREE.LineSegments(cubeEdges, edgeMaterial.clone());
    cubeEdgeLines.renderOrder = 1001; // Выше чем сама фигура
    cubeEdgeLines.material.depthTest = false; // Всегда видны
    cube.add(cubeEdgeLines);

    // Sphere with outline
    const sphereGeometry = new THREE.SphereGeometry(8, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({
        color: 0xff0088,
        emissive: 0x440022,
        shininess: 100
    });
    sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(-30, 15, 140);
    sphere.renderOrder = 999;
    sphere.material.transparent = true;
    sphere.material.opacity = 0.99;
    sphere.material.depthTest = false;
    sphere.material.depthWrite = false;
    scene.add(sphere);

    // Outline for sphere
    const sphereOutline = new THREE.Mesh(new THREE.SphereGeometry(8.4, 32, 32), outlineMaterial.clone());
    sphereOutline.renderOrder = 998;
    sphere.add(sphereOutline);

    // Edge lines for sphere - минимум линий
    const sphereEdges = new THREE.EdgesGeometry(sphereGeometry, 89);
    const sphereEdgeLines = new THREE.LineSegments(sphereEdges, edgeMaterial.clone());
    sphereEdgeLines.renderOrder = 1001;
    sphereEdgeLines.material.depthTest = false;
    sphere.add(sphereEdgeLines);

    // Torus with outline
    const torusGeometry = new THREE.TorusGeometry(10, 3, 16, 100);
    const torusMaterial = new THREE.MeshPhongMaterial({
        color: 0x0088ff,
        emissive: 0x002244,
        shininess: 100
    });
    torus = new THREE.Mesh(torusGeometry, torusMaterial);
    torus.position.set(30, -15, 130);
    torus.renderOrder = 999;
    torus.material.transparent = true;
    torus.material.opacity = 0.99;
    torus.material.depthTest = false;
    torus.material.depthWrite = false;
    scene.add(torus);

    // Outline for torus
    const torusOutline = new THREE.Mesh(new THREE.TorusGeometry(10.4, 3.3, 16, 100), outlineMaterial.clone());
    torusOutline.renderOrder = 998;
    torus.add(torusOutline);

    // Edge lines for torus - только основные границы
    const torusEdges = new THREE.EdgesGeometry(torusGeometry, 60);
    const torusEdgeLines = new THREE.LineSegments(torusEdges, edgeMaterial.clone());
    torusEdgeLines.renderOrder = 1001;
    torusEdgeLines.material.depthTest = false;
    torus.add(torusEdgeLines);

    // Grid floor for depth perception
    const gridSize = 200;
    const gridDivisions = 20;
    const gridGeometry = new THREE.PlaneGeometry(gridSize, gridSize, gridDivisions, gridDivisions);
    const gridMaterial = new THREE.MeshBasicMaterial({
        color: 0x003322,
        wireframe: true,
        transparent: false,
        depthTest: true,
        depthWrite: true
    });

    gridHelper = new THREE.Mesh(gridGeometry, gridMaterial);
    gridHelper.position.z = 80;
    gridHelper.position.y = -40;
    gridHelper.renderOrder = 0;

    scene.add(gridHelper);
}

// Store original Z positions
const originalPositions = {
    cube: 120,
    sphere: 140,
    torus: 130,
    grid: 80
};

// Update object depths based on inversion state
function updateObjectDepths() {
    if (invertAxes) {
        // Inverted: scale down all depths proportionally
        cube.position.z = 60;
        sphere.position.z = 70;
        torus.position.z = 65;
        gridHelper.position.z = 40;
    } else {
        // Normal: restore original positions (objects far, grid closer)
        cube.position.z = originalPositions.cube;
        sphere.position.z = originalPositions.sphere;
        torus.position.z = originalPositions.torus;
        gridHelper.position.z = originalPositions.grid;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Face detection setup
async function initFaceDetection() {
    const loading = document.getElementById('loading');
    const startBtn = document.getElementById('startBtn');
    loading.style.display = 'block';
    startBtn.disabled = true;

    try {
        // Модели лежат рядом с index.html: на телефоне не требуется CDN или
        // повторная загрузка больших файлов с внешнего сайта.
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);

        loading.style.display = 'none';
        startBtn.disabled = false;

        console.log('Face detection models loaded');
    } catch (error) {
        console.error('Error loading face detection models:', error);
        loading.innerHTML = '<p style="color: #ff4444;">Не удалось загрузить модели.</p>' +
            '<p style="font-size:12px;margin-top:10px;line-height:1.4;">' +
            'Откройте проект через веб-сервер (HTTPS), а не как файл из памяти телефона.</p>' +
            '<button id="reloadBtn" style="margin-top:12px;">Повторить</button>';
        document.getElementById('reloadBtn').addEventListener('click', () => location.reload());
    }
}

async function startCamera() {
    video = document.getElementById('video');

    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Камера на телефоне доступна только по HTTPS. Откройте сайт через HTTPS-ссылку, а не через file://.');
        return null;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: isMobileDevice ? 640 : 1280 },
                height: { ideal: isMobileDevice ? 480 : 720 },
                facingMode: 'user'
            }
        });

        video.srcObject = stream;
        await video.play();

        document.getElementById('cameraStatus').classList.remove('inactive');
        document.getElementById('cameraStatus').classList.add('active');

        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve(video);
            };
        });
    } catch (error) {
        console.error('Error accessing camera:', error);
        const message = error.name === 'NotAllowedError'
            ? 'Доступ к камере запрещён. Разрешите камеру для этого сайта в настройках браузера.'
            : 'Не удалось получить доступ к камере. Проверьте HTTPS и разрешения браузера.';
        alert(message);
        return null;
    }
}

async function detectFace() {
    if (!faceDetectionRunning || !video) return;

    let detections = null;
    try {
        detections = await faceapi
            .detectSingleFace(video, detectionOptions)
            .withFaceLandmarks();
    } catch (error) {
        console.warn('Face detection frame failed:', error);
    }

    if (detections) {
        document.getElementById('trackingStatus').classList.remove('inactive');
        document.getElementById('trackingStatus').classList.add('active');

        const box = detections.detection.box;
        const landmarks = detections.landmarks;

        // Calculate face center
        const faceCenterX = box.x + box.width / 2;
        const faceCenterY = box.y + box.height / 2;

        // Normalize coordinates (-1 to 1)
        const normalizedX = (faceCenterX / video.videoWidth) * 2 - 1;
        const normalizedY = -((faceCenterY / video.videoHeight) * 2 - 1);

        // Estimate distance based on face width
        const faceWidthPixels = box.width;
        let estimatedDistance;

        if (calibrationData.isCalibrated) {
            // Use calibrated linear regression formula
            // 1/distance = m * faceWidth + c
            // distance = 1 / (m * faceWidth + c)
            const invDistance = calibrationData.m * faceWidthPixels + calibrationData.c;
            estimatedDistance = 1 / invDistance;
        } else {
            // Fallback to default formula
            estimatedDistance = (calibrationData.faceWidth * video.videoWidth) / (2 * faceWidthPixels * Math.tan(camera.fov * Math.PI / 360));
        }

        // Clamp distance to minimum only
        estimatedDistance = Math.max(30, estimatedDistance);

        // Filter out sudden large jumps
        if (distanceBuffer.length > 0) {
            const lastDistance = distanceBuffer[distanceBuffer.length - 1];
            const distanceChange = Math.abs(estimatedDistance - lastDistance);

            if (distanceChange > DISTANCE_THRESHOLD) {
                // Ignore this reading, use interpolated value instead
                estimatedDistance = lastDistance + Math.sign(estimatedDistance - lastDistance) * DISTANCE_THRESHOLD * 0.3;
            }
        }

        // Add to buffer
        distanceBuffer.push(estimatedDistance);
        if (distanceBuffer.length > DISTANCE_BUFFER_SIZE) {
            distanceBuffer.shift();
        }

        // Calculate weighted moving average (faster than median)
        // More weight to recent values
        let weightedSum = 0;
        let weightTotal = 0;
        for (let i = 0; i < distanceBuffer.length; i++) {
            const weight = i + 1; // Linear weight: newer values weigh more
            weightedSum += distanceBuffer[i] * weight;
            weightTotal += weight;
        }
        const averageDistance = weightedSum / weightTotal;

        // Update position
        lastFacePosition.x = normalizedX * 40;
        lastFacePosition.y = normalizedY * 30;
        lastFacePosition.z = averageDistance;

        // Update UI
        document.getElementById('distance').textContent = Math.round(lastFacePosition.z);
        document.getElementById('posX').textContent = lastFacePosition.x.toFixed(1);
        document.getElementById('posY').textContent = lastFacePosition.y.toFixed(1);
    } else {
        document.getElementById('trackingStatus').classList.remove('active');
        document.getElementById('trackingStatus').classList.add('inactive');
    }

    // FPS calculation
    frameCount++;
    const currentTime = Date.now();
    if (currentTime - lastTime >= 1000) {
        fps = frameCount;
        document.getElementById('fps').textContent = fps;
        frameCount = 0;
        lastTime = currentTime;
    }

    if (faceDetectionRunning) setTimeout(detectFace, detectionInterval);
}

function updateCameraPosition() {
    // Smooth interpolation
    const smoothing = 0.15;
    smoothPosition.x += (lastFacePosition.x - smoothPosition.x) * smoothing;
    smoothPosition.y += (lastFacePosition.y - smoothPosition.y) * smoothing;
    smoothPosition.z += (lastFacePosition.z - smoothPosition.z) * smoothing;

    // Apply inversion multiplier
    const invertMultiplier = invertAxes ? -1 : 1;

    // Apply parallax effect with intensity multiplier (only X and Y)
    camera.position.x = smoothPosition.x * parallaxIntensity * invertMultiplier;
    camera.position.y = smoothPosition.y * parallaxIntensity * invertMultiplier;
    camera.position.z = smoothPosition.z - 100; // Z не зависит от интенсивности

    // Camera looks straight ahead along Z axis
    camera.lookAt(smoothPosition.x * parallaxIntensity * invertMultiplier, smoothPosition.y * parallaxIntensity * invertMultiplier, 1000);
}

function animate() {
    requestAnimationFrame(animate);

    if (faceDetectionRunning) {
        updateCameraPosition();
    }

    // Rotate objects
    if (cube) {
        cube.rotation.x += 0.005;
        cube.rotation.y += 0.007;
    }

    if (sphere) {
        sphere.position.y = 15 + Math.sin(Date.now() * 0.001) * 5;
    }

    if (torus) {
        torus.rotation.x += 0.01;
        torus.rotation.y += 0.005;
    }

    renderer.render(scene, camera);
}

async function calibrate() {
    const calibrationPoints = [];

    // Measurement 1: 40 cm
    let detection1 = null;
    while (!detection1) {
        alert('Калибровка шаг 1/3:\n\nОтойдите на расстояние 40 см от экрана (примерно длина руки от локтя до кончиков пальцев).\n\nСмотрите прямо в камеру.\n\nНажмите OK когда будете готовы.');

        detection1 = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

        if (!detection1) {
            alert('Лицо не обнаружено. Убедитесь что:\n- Камера включена\n- Лицо хорошо освещено\n- Вы смотрите прямо в камеру\n\nПопробуем снова.');
        }
    }

    calibrationPoints.push({
        distance: 40,
        faceWidth: detection1.detection.box.width
    });

    // Measurement 2: 60 cm
    let detection2 = null;
    while (!detection2) {
        alert('Калибровка шаг 2/3:\n\nОтойдите на расстояние 60 см от экрана (примерно длина вытянутой руки).\n\nСмотрите прямо в камеру.\n\nНажмите OK когда будете готовы.');

        detection2 = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

        if (!detection2) {
            alert('Лицо не обнаружено. Убедитесь что:\n- Камера включена\n- Лицо хорошо освещено\n- Вы смотрите прямо в камеру\n\nПопробуем снова.');
        }
    }

    calibrationPoints.push({
        distance: 60,
        faceWidth: detection2.detection.box.width
    });

    // Measurement 3: 80 cm
    let detection3 = null;
    while (!detection3) {
        alert('Калибровка шаг 3/3:\n\nОтойдите на расстояние 80 см от экрана.\n\nСмотрите прямо в камеру.\n\nНажмите OK когда будете готовы.');

        detection3 = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

        if (!detection3) {
            alert('Лицо не обнаружено. Убедитесь что:\n- Камера включена\n- Лицо хорошо освещено\n- Вы смотрите прямо в камеру\n\nПопробуем снова.');
        }
    }

    calibrationPoints.push({
        distance: 80,
        faceWidth: detection3.detection.box.width
    });

    // Calculate calibration coefficient using linear regression
    // Formula: distance = k / faceWidth + b
    // We need to find k and b that best fit our measurements

    // Using inverse relationship: 1/distance vs faceWidth
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = calibrationPoints.length;

    for (const point of calibrationPoints) {
        const x = point.faceWidth;
        const y = 1 / point.distance;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

    // Linear regression: y = mx + c
    const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const c = (sumY - m * sumX) / n;

    // Store calibration data
    calibrationData.m = m;
    calibrationData.c = c;
    calibrationData.isCalibrated = true;

    console.log('Calibration completed:', calibrationData);
    console.log('Calibration points:', calibrationPoints);

    alert(`Калибровка завершена!\n\nИзмерения:\n40 см → ${calibrationPoints[0].faceWidth.toFixed(1)} px\n60 см → ${calibrationPoints[1].faceWidth.toFixed(1)} px\n80 см → ${calibrationPoints[2].faceWidth.toFixed(1)} px\n\nТеперь отслеживание расстояния должно быть более точным.`);
}

// Event listeners
document.getElementById('startBtn').addEventListener('click', async () => {
    const startBtn = document.getElementById('startBtn');

    if (!faceDetectionRunning) {
        startBtn.disabled = true;
        const camera = await startCamera();
        if (!camera) {
            startBtn.disabled = false;
            return;
        }
        faceDetectionRunning = true;
        detectFace();
        startBtn.textContent = 'Остановить отслеживание';
        document.getElementById('calibrateBtn').disabled = false;
        startBtn.disabled = false;
    } else {
        faceDetectionRunning = false;
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        startBtn.textContent = 'Запустить отслеживание';
        document.getElementById('cameraStatus').classList.remove('active');
        document.getElementById('cameraStatus').classList.add('inactive');
        document.getElementById('trackingStatus').classList.remove('active');
        document.getElementById('trackingStatus').classList.add('inactive');
        document.getElementById('calibrateBtn').disabled = true;
    }
});

document.getElementById('calibrateBtn').addEventListener('click', calibrate);

document.getElementById('toggleVideoBtn').addEventListener('click', () => {
    const video = document.getElementById('video');
    const btn = document.getElementById('toggleVideoBtn');

    videoVisible = !videoVisible;
    video.style.display = videoVisible ? 'block' : 'none';
    btn.textContent = videoVisible ? 'Скрыть видео' : 'Показать видео';
});

document.getElementById('parallaxSlider').addEventListener('input', (e) => {
    parallaxIntensity = parseFloat(e.target.value);
    document.getElementById('parallaxValue').textContent = parallaxIntensity.toFixed(1);
});

document.getElementById('invertBtn').addEventListener('click', () => {
    invertAxes = !invertAxes;
    const btn = document.getElementById('invertBtn');
    btn.textContent = invertAxes ? 'Оси инвертированы ✓' : 'Инвертировать оси';
    btn.style.background = invertAxes ? '#0088ff' : '#00ff88';

    // Update object depths when inversion changes
    updateObjectDepths();
});

// Initialize
initThreeJS();
initFaceDetection();
animate();
