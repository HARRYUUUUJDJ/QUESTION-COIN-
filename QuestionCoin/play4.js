    // --- Global Game State Variables (loaded from localStorage) ---
    const LOCAL_STORAGE_MAIN_GAME_STATE_KEY = 'coinTapMasterState'; // Key for main game state
    let coins = 0;
    let keys = 0;
    let currentScore = 0; // Keys earned in the current round

    // --- DOM Elements ---
    const coinsDisplayHeader = document.getElementById('coins-display-header');
    const keysDisplayHeader = document.getElementById('keys-display-header');
    const currentScoreDisplay = document.getElementById('current-score');
    const notificationContainer = document.getElementById('notification-container');
    const gameCanvas = document.getElementById('gameCanvas');
    const ctx = gameCanvas.getContext('2d'); // Get context here ONCE, dude!

    // New ball drop buttons
    const normalBallButton = document.getElementById('normal-ball-button');
    const goldenBallButton = document.getElementById('golden-ball-button');
    const purpleBallButton = document.getElementById('purple-ball-button');

    // Modal elements
    const gameModal = document.getElementById('game-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalButtons = document.getElementById('modal-buttons');

    // === Config & Globals ===
    // BRO: Physics values adjusted for SLOWER ball speed!
    const GRAVITY = 0.3; // Reduced from 0.5 to 0.3 for slower falling
    const BOUNCE_DAMPING = 0.5; // Reduced from 0.6 to 0.5 for more energy loss on bounce (slower bounces)
    const BALL_RADIUS = 10;
    const SLOT_HEIGHT = 50;
    const PEG_RADIUS = 5;

    let balls = [];
    let pegs = [];
    let slots = [];
    let redirectTargetXCoords = []; // Array to hold X-coordinates of slot centers for redirect pegs

    let animationFrameId = null;

    // --- Utility Functions ---
    const formatNumber = (num) => {
        if (num === null || num === undefined) return 'N/A';
        if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    };

    const showNotification = (message, type = 'info') => {
        if (notificationContainer) {
            notificationContainer.textContent = message;
            notificationContainer.className = `notification show ${type}`;
            setTimeout(() => {
                notificationContainer.classList.remove('show');
            }, 3000);
        }
    };

    // --- Modal Functions ---
    const openModal = (title, message, buttonsHtml) => {
        modalTitle.textContent = title;
        modalMessage.innerHTML = message;
        modalButtons.innerHTML = buttonsHtml;
        gameModal.classList.add('active');
    };

    const closeModal = () => {
        gameModal.classList.remove('active');
    };

    gameModal.addEventListener('click', (event) => {
        if (event.target === gameModal) {
            closeModal();
        }
    });

    // --- Game State Management (Local Storage) ---
    const loadGameState = () => {
        try {
            const savedState = localStorage.getItem(LOCAL_STORAGE_MAIN_GAME_STATE_KEY);
            if (savedState) {
                const gameState = JSON.parse(savedState);
                coins = gameState.coins !== undefined ? gameState.coins : 0;
                keys = gameState.keys !== undefined ? gameState.keys : 0;
            } else {
                coins = 0;
                keys = 1000; // Give some starting keys for testing if no state is found
            }
        } catch (e) {
            console.error("Error loading game state:", e);
            showNotification("Error loading game data! Progress might be affected.", "error");
            coins = 0; keys = 0;
        }
    };

    const saveGameState = () => {
        try {
            const gameState = {
                coins: coins,
                keys: keys,
            };
            localStorage.setItem(LOCAL_STORAGE_MAIN_GAME_STATE_KEY, JSON.stringify(gameState));
        } catch (e) {
            console.error("Error saving game state:", e);
            showNotification("Error saving game data! Progress might not be saved.", "error");
        }
    };

    const updateUI = () => {
        coinsDisplayHeader.textContent = formatNumber(coins);
        keysDisplayHeader.textContent = formatNumber(keys);
        currentScoreDisplay.textContent = formatNumber(currentScore);

        // Update button disabled states based on keys
        normalBallButton.disabled = keys < parseInt(normalBallButton.dataset.cost || 10); // Default cost if not set
        goldenBallButton.disabled = keys < parseInt(goldenBallButton.dataset.cost || 50);
        purpleBallButton.disabled = keys < parseInt(purpleBallButton.dataset.cost || 100);
    };

    // === Ball Drawing ===
    function drawBall(ball) {
        ctx.beginPath();
        ctx.fillStyle = ball.color;
        ctx.shadowColor = ball.shadowColor;
        ctx.shadowBlur = 12;
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0; // Reset shadow
    }

    // === Physics & Collision Update ===
    function updateBallPosition() {
        balls = balls.filter(ball => ball.active);

        balls.forEach((ball, index) => {
            // Gravity
            ball.dy += GRAVITY;

            // Update position
            ball.x += ball.dx;
            ball.y += ball.dy;

            // Wall collisions - clamping position to prevent escaping
            if (ball.x + BALL_RADIUS > gameCanvas.width) {
                ball.x = gameCanvas.width - BALL_RADIUS; // Clamp to right edge
                ball.dx *= -BOUNCE_DAMPING; // Reverse direction and dampen
            } else if (ball.x - BALL_RADIUS < 0) {
                ball.x = BALL_RADIUS; // Clamp to left edge
                ball.dx *= -BOUNCE_DAMPING; // Reverse direction and dampen
            }

            if (ball.y - BALL_RADIUS < 0) { // Top wall
                ball.y = BALL_RADIUS; // Clamp to top edge
                ball.dy *= -BOUNCE_DAMPING;
            }

            // Peg collisions
            pegs.forEach(peg => {
                const dx = ball.x - peg.x;
                const dy = ball.y - peg.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = BALL_RADIUS + PEG_RADIUS; // Use PEG_RADIUS constant

                if (dist < minDist) {
                    // Prevent collision too soon after spawn (prevents immediate sticking)
                    if (Date.now() - ball.spawnTime < 100) {
                        return; // Skip collision resolution for a brief moment
                    }

                    // --- Re-integrating Redirect Peg Logic ---
                    if (peg.isRedirect) {
                        const targetX = redirectTargetXCoords[peg.targetSlotIndex];
                        if (targetX !== undefined) {
                            const strength = 0.15;
                            ball.dx = (targetX - ball.x) * strength;
                            ball.dy = Math.max(ball.dy, 8); // Still ensure it keeps falling rapidly if redirected
                            showNotification(`Redirected to ${slots[peg.targetSlotIndex].displayText} slot!`, 'info');
                        }
                    } else {
                        // Original peg collision response
                        const angle = Math.atan2(dy, dx);
                        const speed = Math.sqrt(ball.dx ** 2 + ball.dy ** 2);

                        // Separate balls to prevent sticking
                        const overlap = minDist - dist;
                        ball.x += Math.cos(angle) * overlap;
                        ball.y += Math.sin(angle) * overlap;

                        // Reflect velocity (basic elastic collision)
                        const dotProduct = ball.dx * Math.cos(angle) + ball.dy * Math.sin(angle);
                        if (dotProduct < 0) {
                            ball.dx = Math.cos(angle) * speed * BOUNCE_DAMPING;
                            ball.dy = Math.sin(angle) * speed * BOUNCE_DAMPING;
                        }
                    }

                    // Ensure a minimum downward velocity after *any* peg collision
                    // BRO: Reduced this minimum to allow for slower overall movement
                    if (ball.dy < 3) ball.dy = 3; // Reduced from 5 to 3
                    ball.dx += (Math.random() - 0.5) * 2; // Reduced jitter after collision (from 4 to 2)
                }
            });

            // Keep ball falling down if it's not near the bottom and slowing down
            // BRO: Reduced this minimum to allow for slower overall movement
            if (ball.y + BALL_RADIUS < gameCanvas.height - SLOT_HEIGHT && ball.dy < 1.5) {
                ball.dy = 1.5; // Reduced from 3.0 to 1.5
            }

            // Landing in slot
            if (ball.y + BALL_RADIUS >= gameCanvas.height - SLOT_HEIGHT && ball.active) {
                ball.active = false;
                handleBallLanding(ball);
            }
        });
    }

    // === Ball Landing Logic ===
    function handleBallLanding(ball) {
        let landedInSlot = false;
        slots.forEach(slot => {
            if (ball.x > slot.x && ball.x < slot.x + slot.width) {
                const earnedCoins = Math.round(ball.baseValue * slot.multiplier);
                coins += earnedCoins;
                currentScore += earnedCoins; // Update score with coins earned
                showNotification(`Landed in ${slot.displayText} slot! You earned ${formatNumber(earnedCoins)} coins!`, 'success');
                landedInSlot = true;
            }
        });

        if (!landedInSlot) {
            showNotification("Ball landed outside a slot. No coins earned this time, dude!", 'info');
        }

        saveGameState(); // Save updated coins
        updateUI(); // Update UI
    }

    // === Game Loop ===
    function animate() {
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

        drawPegs();
        drawSlots();

        balls.forEach(ball => {
            if (ball.active) drawBall(ball);
        });

        updateBallPosition();

        if (balls.some(b => b.active)) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(animationFrameId); // Ensure previous frame is cancelled
            animationFrameId = null;
        }
    }

    // === Drop Ball Function (generic) ===
    // This function handles dropping balls from buttons or canvas clicks.
    function dropBalls(numBalls, cost, color, shadowColor, ballBaseValueMultiplier, startX = null) {
        if (keys < cost) {
            openModal('Not Enough Keys!', `You need ${formatNumber(cost)} Keys to drop this ball type, dude! You only have ${formatNumber(keys)} keys.`,
                `<button class="secondary" onclick="closeModal()">Got It</button>`);
            return;
        }

        if (animationFrameId !== null && balls.some(ball => ball.active)) {
            showNotification("Wait for the current balls to land, bro!", 'info');
            return;
        }

        keys -= cost; // Deduct keys
        saveGameState();
        updateUI();
        currentScore = 0; // Reset score for the new round of drops
        currentScoreDisplay.textContent = formatNumber(currentScore); // Update immediately

        // BRO: Use provided startX or randomize if not provided (for button drops)
        const minX = BALL_RADIUS;
        const maxX = gameCanvas.width - BALL_RADIUS;

        for (let i = 0; i < numBalls; i++) {
            const initialX = (startX !== null && numBalls === 1) ?
                             Math.max(minX, Math.min(maxX, startX)) : // Clamp startX if it's a single ball drop
                             (minX + Math.random() * (maxX - minX)); // Random X for multi-ball or if startX not given

            balls.push({
                x: initialX,
                y: BALL_RADIUS * 2, // Start slightly below top edge
                // BRO: Reduced initial horizontal velocity significantly
                dx: (Math.random() - 0.5) * 4, // Was *8, now *4
                // BRO: Reduced initial downward velocity
                dy: 2, // Was 4, now 2
                active: true,
                baseValue: (cost * ballBaseValueMultiplier) / numBalls,
                color,
                shadowColor,
                spawnTime: Date.now()
            });
        }

        if (animationFrameId === null) {
            animate();
        }
    }

    // === Game setup ===
    const setupCanvas = () => {
        const gameContainer = document.querySelector('.game-container');
        if (!gameContainer) {
            console.error("Error: .game-container element not found!");
            return;
        }

        const containerContentWidth = gameContainer.clientWidth;
        const MAX_CANVAS_WIDTH = 700;

        let canvasDrawingWidth = Math.min(containerContentWidth, MAX_CANVAS_WIDTH);
        let calculatedDrawingHeight = canvasDrawingWidth * 0.75; // Increased multiplier for more height!

        const MIN_CANVAS_HEIGHT = 400;
        if (calculatedDrawingHeight < MIN_CANVAS_HEIGHT) {
            calculatedDrawingHeight = MIN_CANVAS_HEIGHT;
            canvasDrawingWidth = calculatedDrawingHeight / 0.75;
        }

        gameCanvas.width = canvasDrawingWidth;
        gameCanvas.height = calculatedDrawingHeight;

        console.log("--- Canvas Setup Debug ---");
        console.log("gameContainer.clientWidth:", gameContainer.clientWidth);
        console.log("MAX_CANVAS_WIDTH:", MAX_CANVAS_WIDTH);
        console.log("Final canvasDrawingWidth set:", gameCanvas.width);
        console.log("Final canvasDrawingHeight set:", gameCanvas.height);
        console.log("--- End Canvas Setup Debug ---");

        createSlots(); // Call createSlots after canvas dimensions are set
        redirectTargetXCoords = slots.map(slot => slot.x + slot.width / 2);
    };

    const createPegs = () => {
        pegs = [];
        const spacingX = gameCanvas.width / 12;
        const spacingY = gameCanvas.height / 10;
        const startY = BALL_RADIUS * 2 + 10;

        for (let row = 0; row < 10; row++) {
            const numColsInRow = (row % 2 === 0) ? 12 : 11;
            const offsetX = (gameCanvas.width - (numColsInRow - 1) * spacingX) / 2;

            for (let col = 0; col < numColsInRow; col++) {
                const x = col * spacingX + offsetX;
                const y = startY + row * spacingY;

                let isRedirectPeg = false;
                let targetSlotIndex = -1;

                // Make pegs in row 3 (index 2) and row 6 (index 5) redirect pegs
                if (row === 2 || row === 5) {
                    // Target the 5x slot (index 2) - still keep some focus on the center
                    if (col === Math.floor(numColsInRow / 2) || col === Math.floor(numColsInRow / 2) - 1) {
                        isRedirectPeg = true;
                        // BRO: This target slot index now points to the new 1x slot
                        targetSlotIndex = 2;
                    }
                    // BRO: EXPANDED: Target 5x slots on the edges
                    else if (col <= 1 || col >= numColsInRow - 2) {
                        isRedirectPeg = true;
                        // BRO: Targetting the new 5x slots on the sides
                        targetSlotIndex = (col <= 1) ? 0 : slots.length - 1;
                    }
                }

                if (x > PEG_RADIUS && x < gameCanvas.width - PEG_RADIUS &&
                    y > PEG_RADIUS && y < gameCanvas.height - SLOT_HEIGHT - PEG_RADIUS) {
                    pegs.push({ x, y, radius: PEG_RADIUS, isRedirect: isRedirectPeg, targetSlotIndex: targetSlotIndex });
                }
            }
        };
    };

    // === Drawing Functions ===
    const drawPegs = () => {
        // ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height); // Clear canvas handled by animate()
        pegs.forEach(peg => {
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
            if (peg.isRedirect) {
                ctx.fillStyle = '#FFFF00'; // Bright yellow for redirect pegs
                ctx.shadowColor = 'rgba(255, 255, 0, 0.7)'; // Yellow glow
                ctx.shadowBlur = 8;
            } else {
                ctx.fillStyle = 'gray'; // Original gray for normal pegs
                ctx.shadowColor = 'rgba(128, 128, 128, 0.5)';
                ctx.shadowBlur = 5;
            }
            ctx.fill();
            ctx.shadowBlur = 0; // Reset shadow
        });
    };

    const createSlots = () => {
        slots = [];
        const count = 5;
        const slotWidth = gameCanvas.width / count;
        const slotY = gameCanvas.height - SLOT_HEIGHT;

        // BRO: Slot values updated: 5x, 0x, 1x, 0x, 5x
        const multipliers = [5, 0, 1, 0, 5]; // Changed from [5, 0, 5, 0, 5]
        const displayTexts = ["5x", "0x", "1x", "0x", "5x"]; // Changed from ["5x", "0x", "5x", "0x", "5x"]

        for (let i = 0; i < count; i++) {
            const x = i * slotWidth;
            slots.push({
                x: x,
                width: slotWidth,
                y: slotY,
                height: SLOT_HEIGHT,
                multiplier: multipliers[i],
                displayText: displayTexts[i]
            });
        }
    };

    const drawSlots = () => {
        slots.forEach(slot => {
            ctx.fillStyle = '#2a003f'; // Dark purple for slots background
            ctx.fillRect(slot.x, slot.y, slot.width, slot.height);

            // Draw slot text (e.g., "1x", "5x", "0x")
            ctx.fillStyle = '#fff'; // White color for text
            ctx.font = 'bold 1.5rem Inter'; // Larger, bold font
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(slot.displayText, slot.x + slot.width / 2, slot.y + SLOT_HEIGHT / 2);

            // Draw the top border of the slot
            ctx.strokeStyle = '#8A2BE2'; // Purple border color
            ctx.lineWidth = 2; // Thicker border
            ctx.beginPath();
            ctx.moveTo(slot.x, slot.y);
            ctx.lineTo(slot.x + slot.width, slot.y);
            ctx.stroke();

            // Draw right vertical divider for each slot (Except for the very last slot)
            if (slot.x + slot.width < gameCanvas.width) {
                ctx.beginPath();
                ctx.moveTo(slot.x + slot.width, slot.y);
                ctx.lineTo(slot.x + slot.width, slot.y + slot.height);
                ctx.stroke();
            }
        });
    };


    // === Event Handlers (calling the new dropBalls function) ===
    const handleDropBallsButton = (event) => {
        const type = event.currentTarget.dataset.type;
        let cost = 0;
        let color = '';
        let shadow = '';
        let numBalls = 0;
        let ballBaseValueMultiplier = 1;

        if (type === 'normal') {
            cost = 10;
            color = '#008CBA';
            shadow = 'rgba(0, 140, 186, 0.7)';
            numBalls = 1; // Only 1 ball for normal
            ballBaseValueMultiplier = 1;
        } else if (type === 'golden') {
            cost = 50;
            color = 'gold';
            shadow = 'orange';
            numBalls = 5;
            ballBaseValueMultiplier = 0.5; // LOWER success rate/profit
        } else if (type === 'purple') {
            cost = 100;
            color = 'purple';
            shadow = 'violet';
            numBalls = 5;
            ballBaseValueMultiplier = 1.5; // HIGHER luck/profit
        }

        // Call dropBalls with null for startX, allowing it to randomize
        dropBalls(numBalls, cost, color, shadow, ballBaseValueMultiplier, null);
    };

    // BRO: New Event Handler for Canvas Click-to-Drop
    const handleCanvasClick = (event) => {
        const rect = gameCanvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left; // Get X relative to canvas

        const cost = 5; // Cost for a single click-drop ball
        const color = '#FFD700'; // A distinct color for click-dropped balls (e.g., gold)
        const shadow = 'rgba(255, 215, 0, 0.7)';
        const ballBaseValueMultiplier = 1.2; // A slight bonus for precision? Or keep at 1.

        // Call the generic dropBalls function with numBalls = 1 and the specific clickX
        dropBalls(1, cost, color, shadow, ballBaseValueMultiplier, clickX);
    };


    // === Initial Setup ===
    const initGame = () => {
        loadGameState();
        setupCanvas();
        createPegs(); // createPegs now relies on redirectTargetXCoords from setupCanvas/createSlots
        updateUI(); // Initial UI update

        // Draw the initial empty board
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        drawPegs();
        drawSlots();

        // Event listeners for the ball drop buttons
        normalBallButton.addEventListener('click', handleDropBallsButton);
        goldenBallButton.addEventListener('click', handleDropBallsButton);
        purpleBallButton.addEventListener('click', handleDropBallsButton);

        // BRO: Add Event Listener for Canvas Click-to-Drop
        gameCanvas.addEventListener('click', handleCanvasClick);

        // Handle canvas resize
        window.addEventListener('resize', () => {
            // Clear any existing animation frames before resizing
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            balls = []; // Clear any active balls on resize for simplicity
            currentScore = 0;
            updateUI();
            setupCanvas(); // Re-run setupCanvas to get new dimensions and recreate slots
            createPegs(); // Recreate pegs based on new canvas size and updated redirectTargetXCoords
            // No need to clearRect or drawPegs/drawSlots here, animate will handle it on next frame
        });
    };

    // Call initGame when the window is fully loaded
    window.onload = initGame;
