  
    (function () {
      'use strict';

      /* ----------------------------------------------------------
         TRANSACTION TIMELINE — dots appear on a scrolling timeline
      ---------------------------------------------------------- */
      (function() {
        var canvas = document.getElementById('number-rain-canvas');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var container = canvas.parentElement;

        var animFrame = null;
        var transactions = [];
        var timelineY = 0;
        var scrollOffset = 0;
        var scrollSpeed = 0.4;
        var nextTxTime = 0;
        var startTime = 0;

        function getColor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

        function resize() {
          var rect = container.getBoundingClientRect();
          var dpr = window.devicePixelRatio || 1;
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          timelineY = rect.height * 0.35;
        }

        function spawnTransaction(x) {
          var h = container.getBoundingClientRect().height;
          // Price point drops below the timeline
          var dropDistance = 30 + Math.random() * (h * 0.35);
          var isGain = Math.random() > 0.35; // slight bias toward gains

          transactions.push({
            x: x,
            priceY: timelineY + dropDistance,
            born: performance.now(),
            dropProgress: 0,
            dotScale: 0,
            lineOpacity: 0,
            isGain: isGain,
            size: 4 + Math.random() * 4, // varying dot sizes
            glowPhase: Math.random() * Math.PI * 2
          });
        }

        function draw() {
          var w = container.getBoundingClientRect().width;
          var h = container.getBoundingClientRect().height;
          var now = performance.now();
          var elapsed = now - startTime;
          var green = getColor('--green');
          var danger = getColor('--danger');
          var border = getColor('--border');
          var accent = getColor('--accent');

          ctx.clearRect(0, 0, w, h);

          // Scroll everything left
          scrollOffset += scrollSpeed;

          // Spawn new transactions at the right edge at irregular intervals
          if (now > nextTxTime) {
            spawnTransaction(w + scrollOffset + 50);
            // Irregular timing — sometimes rapid bursts, sometimes gaps
            var burstChance = Math.random();
            if (burstChance > 0.85) {
              nextTxTime = now + 100 + Math.random() * 200; // rapid burst
            } else if (burstChance > 0.6) {
              nextTxTime = now + 400 + Math.random() * 600; // normal
            } else {
              nextTxTime = now + 800 + Math.random() * 1200; // gap
            }
          }

          // Draw timeline axis — multiple faint horizontal lines
          ctx.strokeStyle = border;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.moveTo(0, timelineY);
          ctx.lineTo(w, timelineY);
          ctx.stroke();

          // Faint grid lines below timeline
          for (var g = 1; g <= 4; g++) {
            ctx.globalAlpha = 0.12;
            ctx.beginPath();
            ctx.moveTo(0, timelineY + g * (h * 0.1));
            ctx.lineTo(w, timelineY + g * (h * 0.1));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          // Draw and update transactions
          for (var i = transactions.length - 1; i >= 0; i--) {
            var tx = transactions[i];
            var screenX = tx.x - scrollOffset;

            // Remove if scrolled off screen left
            if (screenX < -100) {
              transactions.splice(i, 1);
              continue;
            }

            var age = now - tx.born;

            // Animate dot appearing (0-300ms)
            tx.dotScale = Math.min(age / 300, 1);
            tx.dotScale = 1 - Math.pow(1 - tx.dotScale, 3); // ease out

            // Animate drop line (200ms-600ms)
            if (age > 200) {
              tx.dropProgress = Math.min((age - 200) / 400, 1);
              tx.dropProgress = 1 - Math.pow(1 - tx.dropProgress, 3);
            }

            // Line opacity
            tx.lineOpacity = Math.min(age / 500, 1) * 0.6;

            var color = tx.isGain ? green : danger;
            var currentDropY = timelineY + (tx.priceY - timelineY) * tx.dropProgress;

            // Draw vertical drop line
            if (tx.dropProgress > 0) {
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.globalAlpha = tx.lineOpacity;
              ctx.beginPath();
              ctx.moveTo(screenX, timelineY);
              ctx.lineTo(screenX, currentDropY);
              ctx.stroke();
              ctx.globalAlpha = 1;

              // Draw price point dot at bottom of line
              if (tx.dropProgress > 0.5) {
                var priceAlpha = (tx.dropProgress - 0.5) * 2;
                ctx.globalAlpha = priceAlpha * 0.8;
                ctx.beginPath();
                ctx.arc(screenX, currentDropY, tx.size * 0.7, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.globalAlpha = 1;
              }
            }

            // Draw timeline dot
            ctx.beginPath();
            var dotR = tx.size * tx.dotScale;
            ctx.arc(screenX, timelineY, dotR, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.9;
            ctx.fill();
            ctx.globalAlpha = 1;

            // Subtle glow on recent transactions
            if (age < 2000) {
              var glowAlpha = (1 - age / 2000) * 0.3;
              ctx.beginPath();
              ctx.arc(screenX, timelineY, dotR + 6, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.globalAlpha = glowAlpha;
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }

          animFrame = requestAnimationFrame(draw);
        }

        resize();
        startTime = performance.now();
        nextTxTime = startTime + 300;
        window.addEventListener('resize', resize);

        // Pre-populate some transactions so it's not empty on load
        var w = container.getBoundingClientRect().width;
        for (var p = 0; p < 25; p++) {
          var preX = Math.random() * w + scrollOffset;
          var preTx = {
            x: preX + scrollOffset,
            priceY: timelineY + 30 + Math.random() * (container.getBoundingClientRect().height * 0.35),
            born: performance.now() - 5000, // already aged
            dropProgress: 1,
            dotScale: 1,
            lineOpacity: 0.6,
            isGain: Math.random() > 0.35,
            size: 4 + Math.random() * 4,
            glowPhase: Math.random() * Math.PI * 2
          };
          transactions.push(preTx);
        }

        // Visibility observer
        var heroEl = document.getElementById('hero');
        if (heroEl) {
          var vis = new IntersectionObserver(function(entries) {
            if (entries[0].isIntersecting) {
              if (!animFrame) draw();
            } else {
              if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
            }
          }, { threshold: 0 });
          vis.observe(heroEl);
        }
      })();

      /* ----------------------------------------------------------
         NAV SCROLL DETECTION
      ---------------------------------------------------------- */
      var nav = document.getElementById('nav');

      function handleNavScroll() {
        if (window.scrollY > 40) {
          nav.classList.add('scrolled');
        } else {
          nav.classList.remove('scrolled');
        }
      }

      window.addEventListener('scroll', handleNavScroll, { passive: true });
      handleNavScroll(); // run on load

      /* ----------------------------------------------------------
         SMOOTH SCROLL FOR ANCHOR LINKS
      ---------------------------------------------------------- */
      document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
          var href = this.getAttribute('href');
          if (href === '#') return;
          var target = document.querySelector(href);
          if (!target) return;
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      /* ----------------------------------------------------------
         INTERSECTION OBSERVER — .reveal ELEMENTS
      ---------------------------------------------------------- */
      var revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              revealObserver.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.12,
          rootMargin: '0px 0px -40px 0px',
        }
      );

      document.querySelectorAll('.reveal').forEach(function (el) {
        revealObserver.observe(el);
      });

      /* ----------------------------------------------------------
         COUNTER ANIMATION
      ---------------------------------------------------------- */
      function easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
      }

      function animateCounter(el) {
        var target = parseInt(el.getAttribute('data-counter'), 10);
        var suffix = el.getAttribute('data-suffix') || '';
        var prefix = el.getAttribute('data-counter-prefix') || '';
        var duration = 1200;
        var startTime = performance.now();

        function update(currentTime) {
          var elapsed = currentTime - startTime;
          var progress = Math.min(elapsed / duration, 1);
          var eased = easeOutQuart(progress);
          var current = Math.round(eased * target);

          el.textContent = prefix + current + suffix;

          if (progress < 1) {
            requestAnimationFrame(update);
          }
        }

        requestAnimationFrame(update);
      }

      var counterObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              animateCounter(entry.target);
              counterObserver.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.5,
        }
      );

      document.querySelectorAll('[data-counter]').forEach(function (el) {
        counterObserver.observe(el);
      });

      /* ----------------------------------------------------------
         PROBLEM CHART ANIMATION
      ---------------------------------------------------------- */
      var problemChart = document.getElementById('problem-chart');
      if (problemChart) {
        var chartObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                chartObserver.unobserve(entry.target);
              }
            });
          },
          {
            threshold: 0.3,
          }
        );
        chartObserver.observe(problemChart);
      }

      /* ----------------------------------------------------------
         COMPARISON BARS ANIMATION
      ---------------------------------------------------------- */
      var compareBars = document.getElementById('compare-bars');
      if (compareBars) {
        var compareObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                compareObserver.unobserve(entry.target);
              }
            });
          },
          {
            threshold: 0.2,
          }
        );
        compareObserver.observe(compareBars);
      }

      /* ----------------------------------------------------------
         VARIANCE SPECTRUM ANIMATION
      ---------------------------------------------------------- */
      var varianceSpectrum = document.getElementById('variance-spectrum');
      if (varianceSpectrum) {
        var varianceObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                varianceObserver.unobserve(entry.target);
              }
            });
          },
          {
            threshold: 0.3,
          }
        );
        varianceObserver.observe(varianceSpectrum);
      }

      /* ----------------------------------------------------------
         THEME TOGGLE
      ---------------------------------------------------------- */
      var toggle = document.getElementById('theme-toggle');
      var html = document.documentElement;
      var savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        html.setAttribute('data-theme', savedTheme);
      }

      toggle.addEventListener('click', function () {
        var current = html.getAttribute('data-theme');
        var next = current === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      });

    })();

    // How it works pipeline animation
    var pipeline = document.getElementById('how-pipeline');
    if (pipeline) {
      var pipeObs = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting) {
          pipeline.classList.add('animated');
          pipeObs.unobserve(pipeline);
        }
      }, { threshold: 0.3 });
      pipeObs.observe(pipeline);
    }

    // Step illustrations
    (function() {
      function getC(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

      // --- STEP 1: API key typing + connected ---
      (function() {
        var c = document.getElementById('step-canvas-1');
        if (!c) return;
        var ctx = c.getContext('2d');
        var dpr = window.devicePixelRatio || 1;
        var started = false;
        var startTime = 0;

        function resize() {
          var r = c.getBoundingClientRect();
          c.width = r.width * dpr;
          c.height = r.height * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function draw() {
          var w = c.getBoundingClientRect().width;
          var h = c.getBoundingClientRect().height;
          var elapsed = performance.now() - startTime;
          var accent = getC('--accent');
          var green = getC('--green') || accent;
          var border = getC('--border');
          var textMuted = getC('--text-muted');
          var textPrimary = getC('--text-primary');
          var bgCard = getC('--bg-card');

          ctx.clearRect(0, 0, w, h);

          // Input field
          var fieldX = w * 0.06;
          var fieldW = w * 0.88;
          var fieldY = 50;
          var fieldH = 40;

          ctx.fillStyle = bgCard;
          ctx.strokeStyle = border;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(fieldX, fieldY, fieldW, fieldH, 6);
          ctx.fill();
          ctx.stroke();

          // Label
          ctx.font = '1rem ' + getC('--font-mono');
          ctx.fillStyle = textMuted;
          ctx.fillText('API Key', fieldX, 40);

          // Typing animation (0-2s)
          var fullKey = '••••••••XKJF3mQ9';
          var typeDuration = 2000;
          var typeProgress = Math.min(elapsed / typeDuration, 1);
          var charsShown = Math.floor(typeProgress * fullKey.length);
          var typedText = fullKey.substring(0, charsShown);

          ctx.font = '1rem ' + getC('--font-mono');
          ctx.fillStyle = textPrimary;
          ctx.fillText(typedText, fieldX + 12, 77);

          // Blinking cursor
          if (typeProgress < 1 && Math.floor(elapsed / 500) % 2 === 0) {
            var cursorX = fieldX + 12 + ctx.measureText(typedText).width;
            ctx.fillStyle = accent;
            ctx.fillRect(cursorX + 2, 60, 2, 20);
          }

          // Progress bar (2s-3s)
          var barY = fieldY + fieldH + 25;
          var barH = 8;
          ctx.fillStyle = bgCard;
          ctx.strokeStyle = border;
          ctx.beginPath();
          ctx.roundRect(fieldX, barY, fieldW, barH, 4);
          ctx.fill();
          ctx.stroke();

          if (elapsed > 2000) {
            var barProgress = Math.min((elapsed - 2000) / 800, 1);
            var eased = 1 - Math.pow(1 - barProgress, 3);
            ctx.fillStyle = green;
            ctx.beginPath();
            ctx.roundRect(fieldX, barY, fieldW * eased, barH, 4);
            ctx.fill();
          }

          // Connected checkmark (after 3s)
          if (elapsed > 2800) {
            var checkAlpha = Math.min((elapsed - 2800) / 400, 1);
            ctx.globalAlpha = checkAlpha;
            var checkY = barY + 40;

            ctx.fillStyle = green;
            ctx.beginPath();
            ctx.arc(fieldX + 12, checkY + 8, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = bgCard;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(fieldX + 7, checkY + 8);
            ctx.lineTo(fieldX + 11, checkY + 12);
            ctx.lineTo(fieldX + 17, checkY + 4);
            ctx.stroke();

            ctx.font = '600 1rem ' + getC('--font-display');
            ctx.fillStyle = green;
            ctx.fillText('Connected', fieldX + 28, checkY + 13);

            ctx.globalAlpha = 1;
          }

          if (elapsed < 4000 || (elapsed > 4000 && elapsed < 4100)) {
            requestAnimationFrame(draw);
          }
        }

        resize();
        window.addEventListener('resize', resize);
        var obs = new IntersectionObserver(function(entries) {
          if (entries[0].isIntersecting && !started) {
            started = true;
            startTime = performance.now();
            draw();
          }
        }, { threshold: 0.5 });
        obs.observe(c);
      })();

      // --- STEP 2: Wallet address scanning ---
      (function() {
        var c = document.getElementById('step-canvas-2');
        if (!c) return;
        var ctx = c.getContext('2d');
        var dpr = window.devicePixelRatio || 1;
        var started = false;
        var startTime = 0;

        function resize() {
          var r = c.getBoundingClientRect();
          c.width = r.width * dpr;
          c.height = r.height * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function draw() {
          var w = c.getBoundingClientRect().width;
          var h = c.getBoundingClientRect().height;
          var elapsed = performance.now() - startTime;
          var accent = getC('--accent');
          var green = getC('--green') || accent;
          var border = getC('--border');
          var textMuted = getC('--text-muted');
          var textPrimary = getC('--text-primary');
          var bgCard = getC('--bg-card');

          ctx.clearRect(0, 0, w, h);

          var fieldX = w * 0.06;
          var fieldW = w * 0.88;

          // Address typing (0-1.5s)
          var addr = '9qXZvH7c...QgCr2kLp';
          var typeDuration = 1500;
          var typeProgress = Math.min(elapsed / typeDuration, 1);
          var charsShown = Math.floor(typeProgress * addr.length);

          // Label
          ctx.font = '1rem ' + getC('--font-mono');
          ctx.fillStyle = textMuted;
          ctx.fillText('Wallet Address', fieldX, 40);

          // Input field
          ctx.fillStyle = bgCard;
          ctx.strokeStyle = elapsed > 1500 ? green : border;
          ctx.lineWidth = elapsed > 1500 ? 1.5 : 1;
          ctx.beginPath();
          ctx.roundRect(fieldX, 50, fieldW, 40, 6);
          ctx.fill();
          ctx.stroke();

          ctx.font = '1rem ' + getC('--font-mono');
          ctx.fillStyle = textPrimary;
          ctx.fillText(addr.substring(0, charsShown), fieldX + 12, 77);

          // Scanning animation (1.5s-3.5s) — transaction dots appearing
          if (elapsed > 1500) {
            var scanElapsed = elapsed - 1500;

            ctx.font = '1rem ' + getC('--font-mono');
            ctx.fillStyle = textMuted;
            ctx.fillText('Scanning transactions...', fieldX, 115);

            // Scan line sweeping
            if (scanElapsed < 2000) {
              var scanX = fieldX + (fieldW * (scanElapsed % 1000) / 1000);
              ctx.strokeStyle = green;
              ctx.globalAlpha = 0.4;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(scanX, 140);
              ctx.lineTo(scanX, 210);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }

            // Transaction dots appearing
            var txCount = Math.min(Math.floor(scanElapsed / 150), 14);
            for (var i = 0; i < txCount; i++) {
              var dotX = fieldX + 10 + (i % 7) * ((fieldW - 20) / 7) + ((fieldW - 20) / 14);
              var dotY = 150 + Math.floor(i / 7) * 28;
              var dotAge = scanElapsed - (i * 150);
              var dotScale = Math.min(dotAge / 200, 1);
              dotScale = 1 - Math.pow(1 - dotScale, 3);

              ctx.beginPath();
              ctx.arc(dotX, dotY, 5 * dotScale, 0, Math.PI * 2);
              ctx.fillStyle = green;
              ctx.globalAlpha = 0.3 + dotScale * 0.7;
              ctx.fill();
              ctx.globalAlpha = 1;
            }

            // Counter
            if (txCount > 0) {
              ctx.font = '600 1rem ' + getC('--font-mono');
              ctx.fillStyle = green;
              ctx.textAlign = 'center';
              ctx.fillText(txCount + ' transactions found', fieldX + fieldW / 2, 135);
              ctx.textAlign = 'left';
            }
          }

          if (elapsed < 4500) {
            requestAnimationFrame(draw);
          }
        }

        resize();
        window.addEventListener('resize', resize);
        var obs = new IntersectionObserver(function(entries) {
          if (entries[0].isIntersecting && !started) {
            started = true;
            startTime = performance.now();
            draw();
          }
        }, { threshold: 0.5 });
        obs.observe(c);
      })();

      // --- STEP 3: Tax dashboard with counting numbers ---
      (function() {
        var c = document.getElementById('step-canvas-3');
        if (!c) return;
        var ctx = c.getContext('2d');
        var dpr = window.devicePixelRatio || 1;
        var started = false;
        var startTime = 0;

        function resize() {
          var r = c.getBoundingClientRect();
          c.width = r.width * dpr;
          c.height = r.height * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

        function formatNum(n) {
          return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function draw() {
          var w = c.getBoundingClientRect().width;
          var h = c.getBoundingClientRect().height;
          var elapsed = performance.now() - startTime;
          var accent = getC('--accent');
          var green = getC('--green') || accent;
          var danger = getC('--danger');
          var border = getC('--border');
          var textMuted = getC('--text-muted');
          var textPrimary = getC('--text-primary');
          var bgCard = getC('--bg-card');

          ctx.clearRect(0, 0, w, h);

          var padX = w * 0.06;
          var contentW = w - padX * 2;

          // Phase 1: numbers counting (0-2s)
          var countDuration = 2000;
          var countProgress = easeOut(Math.min(elapsed / countDuration, 1));

          var gains = 80473.20 * countProgress;
          var losses = -292.73 * countProgress;
          var income = 19333.57 * countProgress;

          // Main number
          ctx.font = '600 1.3rem ' + getC('--font-display');
          ctx.fillStyle = green;
          ctx.fillText('+$' + formatNum(gains), padX, 50);

          // Sub numbers — separate lines
          ctx.font = '1rem ' + getC('--font-mono');

          ctx.fillStyle = danger;
          ctx.fillText('-$' + formatNum(Math.abs(losses)) + ' losses', padX, 80);

          ctx.fillStyle = textMuted;
          ctx.fillText('$' + formatNum(income) + ' income', padX, 100);

          // Bars (gains/losses visualization)
          var barY = 120;
          var barH = 24;
          var barGap = 8;

          // Gains bar
          ctx.font = '1rem ' + getC('--font-mono');
          ctx.fillStyle = textMuted;
          ctx.fillText('Gains', padX, barY + 16);
          var labelW = 70;

          ctx.fillStyle = bgCard;
          ctx.strokeStyle = border;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(padX + labelW, barY, contentW - labelW, barH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = green;
          ctx.beginPath();
          ctx.roundRect(padX + labelW, barY, (contentW - labelW) * 0.85 * countProgress, barH, 4);
          ctx.fill();

          // Losses bar
          var bar2Y = 155;
          ctx.fillStyle = textMuted;
          ctx.fillText('Losses', padX, bar2Y + 16);

          ctx.fillStyle = bgCard;
          ctx.strokeStyle = border;
          ctx.beginPath();
          ctx.roundRect(padX + labelW, bar2Y, contentW - labelW, barH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = danger;
          ctx.beginPath();
          ctx.roundRect(padX + labelW, bar2Y, (contentW - labelW) * 0.03 * countProgress, barH, 4);
          ctx.fill();

          // Phase 2: Checkmark stamp (after 2.5s)
          if (elapsed > 2500) {
            var stampAlpha = Math.min((elapsed - 2500) / 400, 1);
            var stampScale = 0.5 + easeOut(Math.min((elapsed - 2500) / 300, 1)) * 0.5;
            ctx.globalAlpha = stampAlpha;

            var stampX = padX + contentW - 30;
            var stampY = 205;

            ctx.save();
            ctx.translate(stampX, stampY);
            ctx.scale(stampScale, stampScale);

            // Circle
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fillStyle = green;
            ctx.fill();

            // Check
            ctx.strokeStyle = bgCard;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-7, 0);
            ctx.lineTo(-2, 5);
            ctx.lineTo(8, -5);
            ctx.stroke();

            ctx.restore();

            ctx.font = '600 1rem ' + getC('--font-display');
            ctx.fillStyle = green;
            ctx.fillText('Ready to file', padX, 205);

            ctx.globalAlpha = 1;
          }

          if (elapsed < 3500) {
            requestAnimationFrame(draw);
          }
        }

        resize();
        window.addEventListener('resize', resize);
        var obs = new IntersectionObserver(function(entries) {
          if (entries[0].isIntersecting && !started) {
            started = true;
            startTime = performance.now();
            draw();
          }
        }, { threshold: 0.5 });
        obs.observe(c);
      })();
    })();

    // Methodology live price — CoinCap seed + simulate
    (function() {
      var solOurs = document.getElementById('ml-sol-ours');
      var ethOurs = document.getElementById('ml-eth-ours');
      var btcOurs = document.getElementById('ml-btc-ours');
      var solTheirs = document.getElementById('ml-sol-theirs');
      var ethTheirs = document.getElementById('ml-eth-theirs');
      var btcTheirs = document.getElementById('ml-btc-theirs');
      var tsOurs = document.getElementById('ml-ts-ours');
      var tsTheirs = document.getElementById('ml-ts-theirs');
      if (!solOurs) return;

      var prices = { solana: 83.00, ethereum: 2050.00, bitcoin: 66700.00 };

      function fmt(n) {
        if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return '$' + n.toFixed(2);
      }

      function utcTs() {
        var now = new Date();
        var h = now.getUTCHours(), m = now.getUTCMinutes(), s = now.getUTCSeconds();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + ' UTC';
      }

      function updateOurs() {
        solOurs.textContent = fmt(prices.solana);
        ethOurs.textContent = fmt(prices.ethereum);
        btcOurs.textContent = fmt(prices.bitcoin);
        tsOurs.textContent = utcTs();
      }

      // Snapshot their prices once — exact value at that moment, then frozen
      var theirSnapped = false;
      function snapshotTheirs() {
        if (theirSnapped) return; // only snap once
        theirSnapped = true;
        solTheirs.textContent = fmt(prices.solana);
        ethTheirs.textContent = fmt(prices.ethereum);
        btcTheirs.textContent = fmt(prices.bitcoin);
        // Their timestamp — today's date + current hour rounded down
        var now = new Date();
        var mo = now.getUTCMonth() + 1;
        var da = now.getUTCDate();
        var yr = now.getUTCFullYear();
        var h = now.getUTCHours();
        tsTheirs.textContent = (mo < 10 ? '0' : '') + mo + '/' + (da < 10 ? '0' : '') + da + '/' + yr + ' ' + (h < 10 ? '0' : '') + h + ':00 UTC';
      }

      // Seed real prices from CoinGecko free API, then simulate
      function seedPrices() {
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum,bitcoin&vs_currencies=usd')
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d.solana && d.solana.usd) prices.solana = d.solana.usd;
            if (d.ethereum && d.ethereum.usd) prices.ethereum = d.ethereum.usd;
            if (d.bitcoin && d.bitcoin.usd) prices.bitcoin = d.bitcoin.usd;
            updateOurs();
            snapshotTheirs();
          })
          .catch(function() {
            // CoinGecko failed — try CoinCap WebSocket as fallback
            try {
              var ws = new WebSocket('wss://ws.coincap.io/prices?assets=solana,ethereum,bitcoin');
              ws.onmessage = function(msg) {
                try {
                  var p = JSON.parse(msg.data);
                  if (p.solana) prices.solana = parseFloat(p.solana);
                  if (p.ethereum) prices.ethereum = parseFloat(p.ethereum);
                  if (p.bitcoin) prices.bitcoin = parseFloat(p.bitcoin);
                  updateOurs();
                  snapshotTheirs();
                  ws.close();
                } catch (e) {}
              };
              setTimeout(function() { try { ws.close(); } catch(e) {} }, 4000);
            } catch (e) {}
          });
      }

      // Simulate ticking every 500ms — small random walk from seeded price
      setInterval(function() {
        prices.solana += (Math.random() - 0.48) * 0.15;
        prices.ethereum += (Math.random() - 0.48) * 1.5;
        prices.bitcoin += (Math.random() - 0.48) * 15;
        updateOurs();
      }, 500);

      // Init — only show "our" ticking prices initially
      // "Their" prices stay blank until real seed arrives
      updateOurs();
      solTheirs.textContent = '...';
      ethTheirs.textContent = '...';
      btcTheirs.textContent = '...';
      tsTheirs.textContent = 'Loading...';
      seedPrices();
    })();

    // Exchange network visualization
    (function() {
      var netCanvas = document.getElementById('network-canvas');
      var labelsDiv = document.getElementById('network-labels');
      if (!netCanvas || !labelsDiv) return;
      var ctx = netCanvas.getContext('2d');
      var container = netCanvas.parentElement;

      var logoImages = {};
      var logoSrcs = {
        'GLIDE': '/landing/logos/glide-logo.png',
        'Solana': '/landing/logos/solana.png',
        'Ethereum': '/landing/logos/ethereum.png',
        'Bitcoin': '/landing/logos/bitcoin.png',
        'Binance': '/landing/logos/binance.png',
        'Coinbase': '/landing/logos/coinbase.png',
        'Kraken': '/landing/logos/kraken.png',
        'KuCoin': '/landing/logos/kucoin.png',
        'Phemex': '/landing/logos/phemex.png',
        'MEXC': '/landing/logos/mexc.png',
        'Gemini': '/landing/logos/gemini.png',
        'Crypto.com': '/landing/logos/cryptocom.png'
      };

      Object.keys(logoSrcs).forEach(function(name) {
        var img = new Image();
        img.src = logoSrcs[name];
        logoImages[name] = img;
      });

      var abbreviations = {
        'Coinbase': 'CB',
        'Kraken': 'KR',
        'KuCoin': 'KU',
        'Phemex': 'PH',
        'MEXC': 'MX',
        'Gemini': 'GE',
        'Crypto.com': 'CR'
      };

      var nodes = [
        { name: 'GLIDE', color: null, isHub: true },
        { name: 'Coinbase', color: '#0052FF' },
        { name: 'Binance', color: '#F0B90B' },
        { name: 'Kraken', color: '#5741D9' },
        { name: 'KuCoin', color: '#24AE8F' },
        { name: 'Phemex', color: '#D4AF37' },
        { name: 'MEXC', color: '#1B69F2' },
        { name: 'Gemini', color: '#00DCFA' },
        { name: 'Crypto.com', color: '#002D74' },
        { name: 'Solana', color: '#9945FF' },
        { name: 'Ethereum', color: '#627EEA' },
        { name: 'Bitcoin', color: '#F7931A' }
      ];

      var particles = [];
      var labelEls = [];
      var animFrame = null;

      function getColor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

      function resize() {
        var rect = container.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        netCanvas.width = rect.width * dpr;
        netCanvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var w = rect.width, h = rect.height;
        var cx = w / 2, cy = h / 2;

        // Position nodes: hub at center, others in ellipse
        nodes[0].x = cx;
        nodes[0].y = cy;
        var others = nodes.slice(1);
        var angleStep = (Math.PI * 2) / others.length;
        var rx = Math.min(w * 0.4, 350);
        var ry = Math.min(h * 0.38, 160);
        others.forEach(function(n, i) {
          var a = angleStep * i - Math.PI / 2;
          n.x = cx + Math.cos(a) * rx;
          n.y = cy + Math.sin(a) * ry;
        });

        // Hub label removed — Glide logo image now acts as the hub identifier
      }

      function spawnParticle() {
        var sourceIdx = 1 + Math.floor(Math.random() * (nodes.length - 1));
        var source = nodes[sourceIdx];
        var hub = nodes[0];
        particles.push({
          sx: source.x, sy: source.y,
          tx: hub.x, ty: hub.y,
          progress: 0,
          speed: 0.008 + Math.random() * 0.008,
          color: source.color
        });
      }

      function draw() {
        var w = container.getBoundingClientRect().width;
        var h = container.getBoundingClientRect().height;
        var borderColor = getColor('--border');
        var accentColor = getColor('--accent');
        ctx.clearRect(0, 0, w, h);

        var hub = nodes[0];

        // Draw connection lines
        for (var i = 1; i < nodes.length; i++) {
          var n = nodes[i];
          ctx.beginPath();
          ctx.moveTo(hub.x, hub.y);
          ctx.lineTo(n.x, n.y);
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.3;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Draw outer nodes — logos or branded circles
        for (var j = 1; j < nodes.length; j++) {
          var nd = nodes[j];
          var logo = logoImages[nd.name];
          if (logo && logo.complete && logo.naturalWidth > 0) {
            // Draw logo image
            var logoSize = 38;
            ctx.drawImage(logo, nd.x - logoSize/2, nd.y - logoSize/2, logoSize, logoSize);
          } else if (abbreviations[nd.name]) {
            // Draw branded circle with abbreviation
            ctx.beginPath();
            ctx.arc(nd.x, nd.y, 16, 0, Math.PI * 2);
            ctx.fillStyle = nd.color;
            ctx.fill();
            ctx.font = '600 11px ' + getColor('--font-mono');
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(abbreviations[nd.name], nd.x, nd.y);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          } else {
            // Fallback circle
            ctx.beginPath();
            ctx.arc(nd.x, nd.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = nd.color;
            ctx.fill();
          }
        }

        // Draw hub — Glide logo with pulsating ring
        var glideLogo = logoImages['GLIDE'];
        var pulse = (Math.sin(performance.now() / 600) + 1) * 0.5; // 0..1
        var ringRadius = 42 + pulse * 10;
        var ringAlpha = 0.35 - pulse * 0.25;

        // Pulsating outer ring
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = ringAlpha;
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (glideLogo && glideLogo.complete && glideLogo.naturalWidth > 0) {
          // Draw the Glide logo centered at the hub, scaled to fit aspect ratio
          var logoH = 48;
          var logoW = logoH * (glideLogo.naturalWidth / glideLogo.naturalHeight);
          ctx.drawImage(glideLogo, hub.x - logoW / 2, hub.y - logoH / 2, logoW, logoH);
        } else {
          // Fallback: green dot
          ctx.beginPath();
          ctx.arc(hub.x, hub.y, 18, 0, Math.PI * 2);
          ctx.fillStyle = accentColor;
          ctx.fill();
        }

        // Draw and update particles
        for (var k = particles.length - 1; k >= 0; k--) {
          var p = particles[k];
          p.progress += p.speed;
          if (p.progress >= 1) { particles.splice(k, 1); continue; }
          var px = p.sx + (p.tx - p.sx) * p.progress;
          var py = p.sy + (p.ty - p.sy) * p.progress;
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 1 - p.progress * 0.5;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Spawn new particles
        if (Math.random() > 0.85) spawnParticle();

        animFrame = requestAnimationFrame(draw);
      }

      resize();
      window.addEventListener('resize', resize);

      var netObs = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting) {
          if (!animFrame) draw();
        } else {
          if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        }
      }, { threshold: 0 });
      netObs.observe(container);
    })();

    // Guarantee verification ticker
    (function() {
      var feed = document.getElementById('ticker-feed');
      if (!feed) return;
      var running = false;

      var tokens = ['SOL', 'ETH', 'BTC', 'BONK', 'USDC', 'RAY', 'JUP', 'MATIC', 'LINK', 'UNI'];
      var types = ['Swap', 'Transfer', 'Stake', 'Unstake', 'Bridge', 'LP Deposit', 'LP Withdraw'];

      function randomHash() {
        var chars = '0123456789abcdef';
        var h = '0x';
        for (var i = 0; i < 6; i++) h += chars[Math.floor(Math.random() * 16)];
        h += '...';
        for (var j = 0; j < 4; j++) h += chars[Math.floor(Math.random() * 16)];
        return h;
      }

      function addRow() {
        if (!running) return;
        var row = document.createElement('div');
        row.className = 'guarantee__ticker-row';
        var token = tokens[Math.floor(Math.random() * tokens.length)];
        var type = types[Math.floor(Math.random() * types.length)];
        var amt = (Math.random() * 5000 + 10).toFixed(2);
        row.innerHTML = '<span class="guarantee__ticker-check">&#10003;</span>' +
          '<span class="guarantee__ticker-hash">' + randomHash() + '</span>' +
          '<span>' + type + ' ' + token + '</span>' +
          '<span class="guarantee__ticker-amount">$' + parseFloat(amt).toLocaleString('en-US', {minimumFractionDigits: 2}) + '</span>';

        feed.insertBefore(row, feed.firstChild);

        // Remove old rows
        while (feed.children.length > 8) {
          feed.removeChild(feed.lastChild);
        }

        setTimeout(addRow, 1200 + Math.random() * 800);
      }

      var tickerObs = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting) {
          if (!running) { running = true; addRow(); }
        } else {
          running = false;
        }
      }, { threshold: 0.2 });
      tickerObs.observe(feed.parentElement);
    })();

    // Product showcase tabs — crossfade transition
    function showTab(btn, tabId) {
      document.querySelectorAll('.showcase__tab').forEach(function(t) { t.classList.remove('active'); });
      var current = document.querySelector('.showcase__img-wrap.active');
      var next = document.getElementById('tab-' + tabId);
      if (current && current !== next) {
        current.style.opacity = '0';
        setTimeout(function() {
          current.classList.remove('active');
          current.style.opacity = '';
          next.classList.add('active');
          requestAnimationFrame(function() { next.style.opacity = '1'; });
        }, 300);
      } else {
        next.classList.add('active');
        next.style.opacity = '1';
      }
      btn.classList.add('active');
    }

    // Guided Mode video — autoplay when scrolled into view, pause when out
    (function() {
      var video = document.getElementById('guided-mode-video');
      if (!video) return;
      var videoObs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            video.play().catch(function() {});
          } else {
            video.pause();
          }
        });
      }, { threshold: 0.35 });
      videoObs.observe(video);
    })();

    // Ambient full-page particle field
    (function() {
      var canvas = document.getElementById('ambient-particles');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var particles = [];
      var mouse = { x: -1000, y: -1000 };
      var raf = null;

      function resize() {
        var dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function getAccent() {
        return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      }

      function init() {
        particles = [];
        var count = Math.floor((window.innerWidth * window.innerHeight) / 25000);
        count = Math.max(20, Math.min(count, 60));
        for (var i = 0; i < count; i++) {
          particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            r: 1.5 + Math.random() * 1.5,
            opacity: 0.15 + Math.random() * 0.25
          });
        }
      }

      function draw() {
        var w = window.innerWidth, h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);
        var color = getAccent();

        // Draw connection lines between nearby particles
        for (var i = 0; i < particles.length; i++) {
          for (var j = i + 1; j < particles.length; j++) {
            var dx = particles[i].x - particles[j].x;
            var dy = particles[i].y - particles[j].y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 150) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = color;
              ctx.globalAlpha = (1 - dist / 150) * 0.08;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }

        // Draw particles
        for (var k = 0; k < particles.length; k++) {
          var p = particles[k];

          // Move
          p.x += p.vx;
          p.y += p.vy;

          // Wrap around edges
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;

          // Gentle mouse repulsion
          var mdx = p.x - mouse.x;
          var mdy = p.y - mouse.y;
          var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist < 120 && mdist > 0) {
            p.vx += (mdx / mdist) * 0.02;
            p.vy += (mdy / mdist) * 0.02;
          }

          // Dampen velocity
          p.vx *= 0.999;
          p.vy *= 0.999;

          // Draw dot
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = p.opacity;
          ctx.fill();
        }

        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(draw);
      }

      window.addEventListener('mousemove', function(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      });

      resize();
      init();
      draw();
      window.addEventListener('resize', function() { resize(); init(); });
    })();

  // Hero number rain — randomly placed financial numbers drifting down
  (function() {
    var canvas = document.getElementById('calc-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var container = canvas.parentElement;
    var animFrame = null;
    var items = [];
    var NUM_ITEMS = 300;

    function getC(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

    function randomAmount() {
      var val = (1 + Math.random() * 99999).toFixed(2);
      return '$' + parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function createItem(randomY) {
      var w = container.getBoundingClientRect().width;
      var h = container.getBoundingClientRect().height;
      var isGreen = Math.random() < 0.8;
      return {
        text: (isGreen ? '+' : '-') + randomAmount(),
        x: Math.random() * w,
        y: randomY ? (-40 - Math.random() * h) : (Math.random() * h * 1.2 - h * 0.1),
        speed: 0.15 + Math.random() * 0.35,
        drift: (Math.random() - 0.5) * 0.15,
        isGreen: isGreen,
        baseOpacity: isGreen ? (0.35 + Math.random() * 0.25) : (0.35 + Math.random() * 0.25),
        fontSize: 12 + Math.random() * 4,
        rotation: (Math.random() - 0.5) * 0.15
      };
    }

    function resize() {
      var rect = container.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (items.length === 0) {
        for (var i = 0; i < NUM_ITEMS; i++) {
          items.push(createItem(false));
        }
      }
    }

    function draw() {
      var w = container.getBoundingClientRect().width;
      var h = container.getBoundingClientRect().height;
      var green = getC('--green');
      var danger = getC('--danger');
      var mono = getC('--font-display');

      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        item.y += item.speed;
        item.x += item.drift;

        if (item.y > h + 50) {
          var newItem = createItem(true);
          item.text = newItem.text;
          item.x = newItem.x;
          item.y = newItem.y;
          item.speed = newItem.speed;
          item.drift = newItem.drift;
          item.isGreen = newItem.isGreen;
          item.baseOpacity = newItem.baseOpacity;
          item.fontSize = newItem.fontSize;
          item.rotation = newItem.rotation;
        }

        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rotation);
        ctx.font = (item.isGreen ? 'bold ' : '') + Math.round(item.fontSize) + 'px ' + mono;
        ctx.fillStyle = item.isGreen ? green : danger;
        ctx.globalAlpha = item.baseOpacity;
        ctx.textAlign = 'center';
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      animFrame = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);

    var heroEl = document.getElementById('hero');
    if (heroEl) {
      var vis = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting) {
          if (!animFrame) draw();
        } else {
          if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        }
      }, { threshold: 0 });
      vis.observe(heroEl);
    }
  })();

  // Gradient wave — slow undulating ribbon behind hero
  (function() {
    var canvas = document.getElementById('mesh-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var container = canvas.parentElement;
    var animFrame = null;

    function getC(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

    function resize() {
      var rect = container.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      var w = container.getBoundingClientRect().width;
      var h = container.getBoundingClientRect().height;
      var t = performance.now() / 1000;
      var green = getC('--green');
      var accent = getC('--accent');

      ctx.clearRect(0, 0, w, h);

      var baseY = h * 0.80;

      // 5 arcs — same base shape, evenly spaced, each with its own gradient wave
      var numArcs = 5;
      var totalHeight = h * 0.3;
      var gapHeight = 0;
      var numPts = Math.ceil((w + 100) / 3);

      // Continuous wave position — loops left to right
      // Smooth infinite loop — position wraps 0 to 1 endlessly
      var wavePos2 = (t * 0.16) % 1.0;

      // Generate the base spine — smooth bell curve
      var spinePoints = [];
      for (var xi = 0; xi < numPts; xi++) {
        var x = -50 + xi * 3;
        var nx = x / w;
        var base = Math.exp(-Math.pow((nx - 0.45) * 1.8, 2)) * 0.9;
        var morph = Math.sin(nx * 1.2 + t * 0.05) * 0.025
                  + Math.sin(nx * 0.6 + t * 0.035) * 0.015;
        var y = baseY - (base + morph) * h * 0.4;
        spinePoints.push({ x: x, y: y });
      }

      // Compute full shape edges
      var fullTop = [];
      var fullBot = [];
      for (var ei = 0; ei < spinePoints.length; ei++) {
        var enx = spinePoints[ei].x / w;
        var thick = totalHeight * (0.4 + 0.6 * Math.sin(enx * Math.PI));
        thick += Math.sin(enx * 1.5 + t * 0.04) * totalHeight * 0.05;
        fullTop.push({ x: spinePoints[ei].x, y: spinePoints[ei].y - thick * 0.5 });
        fullBot.push({ x: spinePoints[ei].x, y: spinePoints[ei].y + thick * 0.5 });
      }

      // Draw each arc as an evenly-spaced band
      for (var ai = 0; ai < numArcs; ai++) {
        var fracTop = ai / numArcs;
        var fracBot = (ai + 1) / numArcs;
        var gapFrac = gapHeight / totalHeight;
        var adjTop = fracTop + (ai > 0 ? gapFrac * 0.5 : 0);
        var adjBot = fracBot - (ai < numArcs - 1 ? gapFrac * 0.5 : 0);

        // Build arc shape path
        ctx.beginPath();
        for (var pi = 0; pi < spinePoints.length; pi++) {
          var ay = fullTop[pi].y + (fullBot[pi].y - fullTop[pi].y) * adjTop;
          if (pi === 0) ctx.moveTo(spinePoints[pi].x, ay);
          else ctx.lineTo(spinePoints[pi].x, ay);
        }
        for (var pi2 = spinePoints.length - 1; pi2 >= 0; pi2--) {
          var ay2 = fullTop[pi2].y + (fullBot[pi2].y - fullTop[pi2].y) * adjBot;
          ctx.lineTo(spinePoints[pi2].x, ay2);
        }
        ctx.closePath();

        // Single horizontal gradient — smooth traveling wave
        var arcWavePos = wavePos2 + ai * 0.12;
        var hGrad = ctx.createLinearGradient(0, 0, w, 0);

        for (var gs = 0; gs <= 60; gs++) {
          var gx = gs / 60;
          var rawDist = gx - arcWavePos;
          rawDist = rawDist - Math.floor(rawDist + 0.5);
          var wdist = Math.abs(rawDist);
          var bright = Math.max(0, 1 - wdist / 0.3);
          bright = bright * bright;

          var greenVal = Math.round(140 + bright * 115);
          var opacity = bright * 0.5;
          hGrad.addColorStop(gx, 'rgba(16,' + greenVal + ',80,' + opacity + ')');
        }

        ctx.fillStyle = hGrad;
        ctx.globalAlpha = 1;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animFrame = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);

    var heroEl = document.getElementById('hero');
    if (heroEl) {
      var vis = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting) {
          if (!animFrame) draw();
        } else {
          if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        }
      }, { threshold: 0 });
      vis.observe(heroEl);
    }
  })();

  // VS Comparison — 6 hourly candles vs 3600 second-level candles
  (function() {
    var candleCanvas = document.getElementById('vs-candles');
    var lineCanvas = document.getElementById('vs-line');
    if (!candleCanvas || !lineCanvas) return;

    var drawn = false;
    function getC(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

    // Generate realistic price data — hand-crafted intraday shape + micro noise
    // Shape: starts ~145, dips, climbs to ~148-149 by 1-2PM, pulls back,
    // rallies ~147-148 around 3-4PM, sells off to ~145 by 6PM
    var priceData = [];

    // Define the macro price curve as keyframes (index, price)
    // 0=12PM, 3600=1PM, 7200=2PM, 10800=3PM, 14400=4PM, 18000=5PM, 21600=6PM
    var keyframes = [
      [0, 145.0],        // 12:00 — open
      [900, 144.5],      // 12:15 — slight dip
      [1800, 145.2],     // 12:30 — recovery
      [2700, 146.0],     // 12:45 — climbing
      [3600, 146.8],     // 1:00 — momentum building
      [4500, 147.5],     // 1:15 — pushing higher
      [5400, 148.2],     // 1:30 — strong move
      [6300, 148.8],     // 1:45 — approaching high
      [7200, 148.5],     // 2:00 — slight pullback
      [7654, 147.50],    // 2:07 — the trade point
      [8100, 147.8],     // 2:15 — recovery after dip
      [9000, 147.2],     // 2:30 — consolidation
      [9900, 146.5],     // 2:45 — pulling back
      [10800, 146.8],    // 3:00 — stabilizing
      [11700, 147.5],    // 3:15 — second rally attempt
      [12600, 148.0],    // 3:30 — pushing up
      [13500, 147.8],    // 3:45 — minor pullback
      [14400, 147.2],    // 4:00 — losing steam
      [15300, 146.8],    // 4:15 — drift down
      [16200, 146.2],    // 4:30 — selling pressure
      [17100, 145.8],    // 4:45 — continued selling
      [18000, 145.5],    // 5:00 — approaching close
      [18900, 145.2],    // 5:15 — late day drift
      [19800, 145.0],    // 5:30 — back to open
      [20700, 144.8],    // 5:45 — slight weakness
      [21599, 145.0],    // 6:00 — close near open
    ];

    // Interpolate between keyframes + add micro noise
    for (var i = 0; i < 21600; i++) {
      // Find surrounding keyframes
      var kfBefore = keyframes[0];
      var kfAfter = keyframes[keyframes.length - 1];
      for (var k = 0; k < keyframes.length - 1; k++) {
        if (i >= keyframes[k][0] && i < keyframes[k + 1][0]) {
          kfBefore = keyframes[k];
          kfAfter = keyframes[k + 1];
          break;
        }
      }

      // Smooth interpolation (cosine for smooth curves)
      var t = (i - kfBefore[0]) / (kfAfter[0] - kfBefore[0]);
      t = (1 - Math.cos(t * Math.PI)) / 2; // cosine ease
      var basePrice = kfBefore[1] + (kfAfter[1] - kfBefore[1]) * t;

      // Add micro noise for tick-level red/green alternation
      var micro = (Math.random() - 0.5) * 0.06;
      // Add small meso-level wobble
      var meso = Math.sin(i / 300) * 0.15 + Math.sin(i / 150) * 0.08 + Math.sin(i / 50) * 0.04;

      var price = basePrice + micro + meso;
      price = Math.max(140.5, Math.min(149.5, price));
      priceData.push(price);
    }

    var targetPrice = 143.12;

    var priceMin = 140.0;
    var priceMax = 150.0;

    function setupCanvas(canvas) {
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: ctx, w: rect.width, h: rect.height };
    }

    function priceToY(p, h, padT, padB) {
      var chartH = h - padT - padB;
      return padT + chartH * (1 - (p - priceMin) / (priceMax - priceMin));
    }

    function drawAxes(ctx, w, h, padL, padR, padT, padB) {
      var border = getC('--border');
      var textMuted = getC('--text-primary');
      var mono = getC('--font-mono');

      // Y axis line
      ctx.strokeStyle = textMuted;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, h - padB);
      ctx.stroke();

      // X axis line
      ctx.beginPath();
      ctx.moveTo(padL, h - padB);
      ctx.lineTo(w - padR, h - padB);
      ctx.stroke();

      // Horizontal grid lines + Y labels
      ctx.font = '11px ' + mono;
      ctx.fillStyle = textMuted;
      ctx.textAlign = 'right';
      for (var p = 141; p <= 149; p += 1) {
        var gy = priceToY(p, h, padT, padB);
        ctx.strokeStyle = border;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.12;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();
        ctx.setLineDash([]);
        // Only label whole numbers
        if (p % 1 === 0) {
          ctx.globalAlpha = 0.85;
          ctx.fillText('$' + p, padL - 5, gy + 4);
        }
      }

      // X axis time labels
      ctx.textAlign = 'center';
      var times = ['12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM'];
      var chartW = w - padL - padR;
      for (var ti = 0; ti < times.length; ti++) {
        var tx = padL + (ti / 6) * chartW;
        ctx.globalAlpha = 0.85;
        ctx.fillText(times[ti], tx, h - padB + 14);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(tx, h - padB);
        ctx.lineTo(tx, h - padB + 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    function drawHourlyCandles() {
      var setup = setupCanvas(candleCanvas);
      var ctx = setup.ctx, w = setup.w, h = setup.h;
      var danger = getC('--danger');
      var green = getC('--green');
      var padL = 45, padR = 10, padT = 15, padB = 25;

      drawAxes(ctx, w, h, padL, padR, padT, padB);

      var chartW = w - padL - padR;
      var candleW = chartW / 6 * 0.4;
      var candleSpacing = chartW / 6;

      for (var ci = 0; ci < 6; ci++) {
        var startIdx = ci * 3600;
        var endIdx = (ci + 1) * 3600;
        var slice = priceData.slice(startIdx, endIdx);
        var open = slice[0];
        var close = slice[slice.length - 1];
        var high = Math.max.apply(null, slice);
        var low = Math.min.apply(null, slice);

        var cx = padL + ci * candleSpacing + candleSpacing / 2;
        var isUp = close >= open;
        var color = isUp ? green : danger;

        var highY = priceToY(high, h, padT, padB);
        var lowY = priceToY(low, h, padT, padB);
        var openY = priceToY(open, h, padT, padB);
        var closeY = priceToY(close, h, padT, padB);
        var bodyTop = Math.min(openY, closeY);
        var bodyBot = Math.max(openY, closeY);
        var bodyH = Math.max(bodyBot - bodyTop, 2);

        var isHighlighted = (ci === 2); // 2-3PM candle
        var wickAlpha = isHighlighted ? 0.7 : 0.2;
        var bodyAlpha = isHighlighted ? 0.6 : 0.15;

        // Wick ABOVE body (high to body top)
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = wickAlpha;
        ctx.beginPath();
        ctx.moveTo(cx, highY);
        ctx.lineTo(cx, bodyTop);
        ctx.stroke();

        // Wick BELOW body (body bottom to low)
        ctx.beginPath();
        ctx.moveTo(cx, bodyBot);
        ctx.lineTo(cx, lowY);
        ctx.stroke();

        // Body (filled rectangle — no wick through it)
        ctx.fillStyle = color;
        ctx.globalAlpha = bodyAlpha;
        ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);
        ctx.globalAlpha = 1;
      }

      // Highlight the 2-3PM candle region — blue to match the second chart
      var hlX = padL + 2 * candleSpacing;
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 0.1;
      ctx.fillRect(hlX, padT, candleSpacing, h - padT - padB);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.35;
      ctx.strokeRect(hlX, padT, candleSpacing, h - padT - padB);
      ctx.globalAlpha = 1;

      // Pin at highest point in the 2-3PM candle (hourly estimate overshoots)
      var hourSlicePin = priceData.slice(7200, 10800);
      var highestPrice = Math.max.apply(null, hourSlicePin);
      var pinX = padL + 2 * candleSpacing + candleSpacing / 2;
      var pinY = priceToY(highestPrice, h, padT, padB);

      // Vertical dashed line at identified price
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pinX, padT);
      ctx.lineTo(pinX, h - padB);
      ctx.stroke();
      ctx.setLineDash([]);

      // Blue dot — outer glow
      ctx.beginPath();
      ctx.arc(pinX, pinY, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 0.15;
      ctx.fill();
      // Blue dot — solid
      ctx.beginPath();
      ctx.arc(pinX, pinY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 1;
      ctx.fill();
      // White center
      ctx.beginPath();
      ctx.arc(pinX, pinY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Price label — position above the chart area so it doesn't overlap candles
      ctx.font = 'bold 12px ' + (getC('--font-mono') || 'monospace');
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      var labelText = '$' + highestPrice.toFixed(2);
      var labelY = Math.max(padT - 2, 12);
      ctx.fillText(labelText, pinX, labelY);
    }

    function drawSecondCandles() {
      var setup = setupCanvas(lineCanvas);
      var ctx = setup.ctx, w = setup.w, h = setup.h;
      var green = getC('--green');
      var danger = getC('--danger');
      var border = getC('--border');
      var textColor = getC('--text-primary');
      var mono = getC('--font-mono');
      var padL = 45, padR = 10, padT = 15, padB = 25;

      // Generate sin-wave price data for 180 candles (3 minutes)
      // Peak at $147.70, oscillates ~$1.5 amplitude with variance
      var totalCandles = 180;
      var ticksPerCandle = 10;
      var totalTicks = totalCandles * ticksPerCandle;
      var zoomData = [];
      var seed = 42;
      function seededRand() { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; }

      // Sin wave with 3 peaks: left=$148.32, middle=$147.70 (trade point), right=~$147.60
      var peak = 148.32;
      var amplitude = 1.0;
      for (var ti = 0; ti < totalTicks; ti++) {
        var t = ti / totalTicks;
        // ~2.5 full cycles across the window for higher frequency
        var sinVal = Math.sin(t * Math.PI * 5 - Math.PI * 0.5);
        // Secondary oscillations for variance
        var sinVal2 = Math.sin(t * Math.PI * 11.3) * 0.12;
        var sinVal3 = Math.sin(t * Math.PI * 19.7) * 0.05;
        // Seeded noise for tick variance
        var noise = (seededRand() - 0.5) * 0.1;
        // Build price from peak downward
        var offset = (1 - sinVal) * 0.5 * amplitude + Math.abs(sinVal2) + Math.abs(sinVal3) + Math.abs(noise);
        // Smooth suppression curve (piecewise linear) so data stays continuous.
        // Anchors: t=0.1 → 0, t=0.5 → 0.62, t=0.9 → 0.72
        var suppress;
        if (t < 0.1) {
          suppress = 0;
        } else if (t < 0.5) {
          suppress = 0.62 * (t - 0.1) / 0.4;
        } else if (t < 0.9) {
          suppress = 0.62 + 0.10 * (t - 0.5) / 0.4;
        } else {
          suppress = 0.72;
        }
        var price = peak - offset - suppress;
        zoomData.push(price);
      }

      // Find price range for this window
      var zoomMin = Math.min.apply(null, zoomData) - 0.3;
      var zoomMax = Math.max.apply(null, zoomData) + 0.3;

      function zoomPriceToY(p) {
        var chartH = h - padT - padB;
        return padT + chartH * (1 - (p - zoomMin) / (zoomMax - zoomMin));
      }

      // Draw axes for zoomed view
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, h - padB);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padL, h - padB);
      ctx.lineTo(w - padR, h - padB);
      ctx.stroke();

      // Y axis labels
      ctx.font = '11px ' + mono;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'right';
      var priceStep = (zoomMax - zoomMin) / 4;
      for (var yi = 0; yi <= 4; yi++) {
        var yp = zoomMin + yi * priceStep;
        var yy = zoomPriceToY(yp);
        ctx.globalAlpha = 0.85;
        ctx.fillText('$' + yp.toFixed(1), padL - 5, yy + 4);
        ctx.strokeStyle = border;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.12;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padL, yy);
        ctx.lineTo(w - padR, yy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // X axis labels — seconds within the 3-minute window
      ctx.textAlign = 'center';
      var chartW = w - padL - padR;
      var secLabels = ['2:05:30', '2:06:00', '2:06:30', '2:07:00', '2:07:30', '2:08:00', '2:08:30'];
      for (var xi = 0; xi < secLabels.length; xi++) {
        var xx = padL + (xi / 6) * chartW;
        ctx.fillStyle = textColor;
        ctx.globalAlpha = 0.85;
        ctx.fillText(secLabels[xi], xx, h - padB + 14);
      }
      ctx.textAlign = 'left';

      // Draw 180 candles (one per second within 3 minutes)
      var step = Math.max(1, Math.floor(zoomData.length / totalCandles));

      for (var ci = 0; ci < totalCandles; ci++) {
        var startIdx = ci * step;
        var endIdx = startIdx + step;
        if (endIdx > zoomData.length) break;

        var open = zoomData[startIdx];
        var close = zoomData[endIdx - 1];
        var high = open, low = open;
        for (var si = startIdx; si < endIdx; si++) {
          if (zoomData[si] > high) high = zoomData[si];
          if (zoomData[si] < low) low = zoomData[si];
        }

        var cx = padL + (ci / totalCandles) * chartW;
        var isUp = close >= open;
        var color = isUp ? green : danger;

        var highY = zoomPriceToY(high);
        var lowY = zoomPriceToY(low);
        var openY = zoomPriceToY(open);
        var closeY = zoomPriceToY(close);
        var bodyTop = Math.min(openY, closeY);
        var bodyH = Math.max(Math.abs(closeY - openY), 0.5);

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(cx, highY);
        ctx.lineTo(cx, lowY);
        ctx.stroke();

        // Body — full width so candles touch with no gaps
        var bodyW = chartW / totalCandles;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, Math.max(bodyH, 0.5));
      }
      ctx.globalAlpha = 1;

      // Pin at the trade point — search the middle third so the dot lands on the middle peak
      var searchStart = Math.floor(zoomData.length * 0.35);
      var searchEnd = Math.floor(zoomData.length * 0.65);
      var closestIdx = searchStart;
      var closestDist = 999;
      for (var fi = searchStart; fi < searchEnd; fi++) {
        var d = Math.abs(zoomData[fi] - 147.70);
        if (d < closestDist) { closestDist = d; closestIdx = fi; }
      }
      var pinCandleIdx = Math.round(closestIdx / step);
      var pinX = padL + (pinCandleIdx / totalCandles) * chartW;
      var pinY = zoomPriceToY(147.70);

      // Vertical dashed line at trade point
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(pinX, padT);
      ctx.lineTo(pinX, h - padB);
      ctx.stroke();
      ctx.setLineDash([]);

      // Blue dot — outer glow
      ctx.beginPath();
      ctx.arc(pinX, pinY, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 0.15;
      ctx.fill();
      // Blue dot — solid
      ctx.beginPath();
      ctx.arc(pinX, pinY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 1;
      ctx.fill();
      // White center
      ctx.beginPath();
      ctx.arc(pinX, pinY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Price label — position above the chart area so it doesn't overlap candles
      ctx.font = 'bold 12px ' + mono;
      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      var labelY2 = Math.max(padT - 2, 12);
      ctx.fillText('$147.70', pinX, labelY2);
    }

    function updatePriceLabels() {
      // "Their" price = highest point in the 2-3PM hourly candle (overshoots)
      var hourSlice = priceData.slice(7200, 10800);
      var theirPrice = Math.max.apply(null, hourSlice);

      // "Our" price = $147.70 (exact price at the second of trade)
      var ourPrice = 147.70;

      var themEl = document.getElementById('vs-price-them');
      var usEl = document.getElementById('vs-price-us');
      if (themEl) themEl.textContent = '$' + theirPrice.toFixed(2);
      if (usEl) usEl.textContent = '$' + ourPrice.toFixed(2);
    }

    function drawBoth() {
      drawHourlyCandles();
      drawSecondCandles();
      updatePriceLabels();
    }

    var obs = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting && !drawn) {
        drawn = true;
        drawBoth();
        window.addEventListener('resize', drawBoth);
      }
    }, { threshold: 0.3 });
    obs.observe(candleCanvas);
  })();

  // 7-segment countdown timers
  (function() {
    var canvases = document.querySelectorAll('.timer-canvas');
    if (!canvases.length) return;

    function getC(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

    // 7-segment patterns: which segments are on for each digit 0-9
    // Segments: top, topLeft, topRight, middle, bottomLeft, bottomRight, bottom
    var digits = {
      '0': [1,1,1,0,1,1,1],
      '1': [0,0,1,0,0,1,0],
      '2': [1,0,1,1,1,0,1],
      '3': [1,0,1,1,0,1,1],
      '4': [0,1,1,1,0,1,0],
      '5': [1,1,0,1,0,1,1],
      '6': [1,1,0,1,1,1,1],
      '7': [1,0,1,0,0,1,0],
      '8': [1,1,1,1,1,1,1],
      '9': [1,1,1,1,0,1,1]
    };

    function drawSegment(ctx, x, y, w, h, on, green, border) {
      ctx.fillStyle = on ? green : border;
      ctx.globalAlpha = on ? 0.85 : 0.12;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 1.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawDigit(ctx, ox, oy, digit, green, border) {
      var segs = digits[digit] || digits['0'];
      var sw = 14; // segment width (horizontal)
      var sh = 3;  // segment height (thickness)
      var sv = 14; // segment height (vertical)

      // top
      drawSegment(ctx, ox + 3, oy, sw, sh, segs[0], green, border);
      // top-left
      drawSegment(ctx, ox, oy + 3, sh, sv, segs[1], green, border);
      // top-right
      drawSegment(ctx, ox + sw + 3, oy + 3, sh, sv, segs[2], green, border);
      // middle
      drawSegment(ctx, ox + 3, oy + sv + 3, sw, sh, segs[3], green, border);
      // bottom-left
      drawSegment(ctx, ox, oy + sv + 6, sh, sv, segs[4], green, border);
      // bottom-right
      drawSegment(ctx, ox + sw + 3, oy + sv + 6, sh, sv, segs[5], green, border);
      // bottom
      drawSegment(ctx, ox + 3, oy + sv * 2 + 6, sw, sh, segs[6], green, border);
    }

    function drawColon(ctx, x, y, green) {
      ctx.fillStyle = green;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y + 12, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y + 24, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function formatTime(totalSeconds) {
      var m = Math.floor(totalSeconds / 60);
      var s = totalSeconds % 60;
      var mm = (m < 10 ? '0' : '') + m;
      var ss = (s < 10 ? '0' : '') + s;
      return mm + ':' + ss;
    }

    // Set up all canvases
    var timers = [];
    canvases.forEach(function(canvas) {
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;
      canvas.width = 160 * dpr;
      canvas.height = 44 * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var startSeconds = parseInt(canvas.getAttribute('data-start')) || 120;
      var digitWidth = 20;
      var colonWidth = 10;

      function render(seconds) {
        var green = getC('--green');
        var border = getC('--border');
        ctx.clearRect(0, 0, 160, 44);

        var timeStr = formatTime(seconds);
        var ox = 20;
        var oy = 4;

        drawDigit(ctx, ox, oy, timeStr[0], green, border);
        drawDigit(ctx, ox + digitWidth + 2, oy, timeStr[1], green, border);
        drawColon(ctx, ox + (digitWidth + 2) * 2 + colonWidth / 2, oy, green);
        drawDigit(ctx, ox + (digitWidth + 2) * 2 + colonWidth + 4, oy, timeStr[3], green, border);
        drawDigit(ctx, ox + (digitWidth + 2) * 3 + colonWidth + 6, oy, timeStr[4], green, border);
      }

      render(startSeconds);
      timers.push({ render: render, start: startSeconds, current: startSeconds });
    });

    // Sequential countdown: timer 1 finishes, then timer 2, then timer 3
    var started = false;
    var currentTimer = 0;
    var interval = null;

    function runNext() {
      if (currentTimer >= timers.length) return; // all done
      var t = timers[currentTimer];
      interval = setInterval(function() {
        if (t.current > 0) {
          t.current--;
          t.render(t.current);
        } else {
          clearInterval(interval);
          currentTimer++;
          if (currentTimer < timers.length) {
            setTimeout(runNext, 500); // brief pause between timers
          }
        }
      }, 1000);
    }

    // Start when first timer scrolls into view
    var obs = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting && !started) {
        started = true;
        runNext();
      }
    }, { threshold: 0.3 });
    obs.observe(canvases[0]);
  })();

  // Comparison grid animated icons
  (function() {
    var icons = document.querySelectorAll('.compare-icon');
    if (!icons.length) return;

    function getC(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

    icons.forEach(function(canvas) {
      if (typeof canvas.getContext !== 'function') return; // skip SVGs
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = 80 * dpr;
      canvas.height = 80 * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var type = canvas.getAttribute('data-icon');
      var animFrame = null;
      var startTime = 0;
      var started = false;

      function draw() {
        var t = (performance.now() - startTime) / 1000;
        var green = getC('--green');
        var danger = getC('--danger');
        var border = getC('--border');
        ctx.clearRect(0, 0, 80, 80);

        switch(type) {

          // --- PRICE GRANULARITY ---
          case 'granularity-bad':
            // Magnifying glass with blurry/pixelated center — jittering squares inside lens
            ctx.strokeStyle = danger;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.7;
            ctx.lineCap = 'round';
            // Handle line from circle edge to bottom-right
            ctx.beginPath();
            ctx.moveTo(35 + 18 * Math.cos(Math.PI * 0.75), 35 + 18 * Math.sin(Math.PI * 0.75));
            ctx.lineTo(60, 60);
            ctx.stroke();
            // Lens circle
            ctx.beginPath();
            ctx.arc(35, 35, 18, 0, Math.PI * 2);
            ctx.stroke();
            // Clip to lens interior for pixelated squares
            ctx.save();
            ctx.beginPath();
            ctx.arc(35, 35, 16, 0, Math.PI * 2);
            ctx.clip();
            // 4 jittering small squares in a 2x2 grid
            var sqPositions = [[-6, -6], [2, -6], [-6, 2], [2, 2]];
            sqPositions.forEach(function(sq, i) {
              var jx = sq[0] + Math.sin(t * 3.5 + i * 1.7) * 2.5;
              var jy = sq[1] + Math.cos(t * 2.8 + i * 2.3) * 2.5;
              ctx.fillStyle = danger;
              ctx.globalAlpha = 0.4 + Math.sin(t * 2 + i) * 0.2;
              ctx.fillRect(35 + jx, 35 + jy, 6, 6);
            });
            ctx.restore();
            ctx.globalAlpha = 1;
            break;

          case 'granularity-good':
            // Magnifying glass with sharp precise center — crosshair + pulsing dot
            ctx.strokeStyle = green;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.85;
            ctx.lineCap = 'round';
            // Handle
            ctx.beginPath();
            ctx.moveTo(35 + 18 * Math.cos(Math.PI * 0.75), 35 + 18 * Math.sin(Math.PI * 0.75));
            ctx.lineTo(60, 60);
            ctx.stroke();
            // Lens circle
            ctx.beginPath();
            ctx.arc(35, 35, 18, 0, Math.PI * 2);
            ctx.stroke();
            // Crosshair inside lens
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(35, 22); ctx.lineTo(35, 30);
            ctx.moveTo(35, 40); ctx.lineTo(35, 48);
            ctx.moveTo(22, 35); ctx.lineTo(30, 35);
            ctx.moveTo(40, 35); ctx.lineTo(48, 35);
            ctx.stroke();
            // Pulsing sharp dot at exact center
            var pulseR = 3 + Math.sin(t * 3) * 1;
            ctx.beginPath();
            ctx.arc(35, 35, pulseR, 0, Math.PI * 2);
            ctx.fillStyle = green;
            ctx.globalAlpha = 0.7 + Math.sin(t * 3) * 0.2;
            ctx.fill();
            // Glow ring
            ctx.beginPath();
            ctx.arc(35, 35, pulseR + 3, 0, Math.PI * 2);
            ctx.strokeStyle = green;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.2 + Math.sin(t * 3) * 0.1;
            ctx.stroke();
            ctx.globalAlpha = 1;
            break;

          // --- UNLISTED TOKENS ---
          case 'unlisted-bad':
            // Cracked coin — circle with diagonal zigzag crack, halves slowly separating
            var split = Math.sin(t * 1.8) * 1.5;
            ctx.strokeStyle = danger;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6;
            ctx.lineCap = 'round';
            // Left half of coin circle
            ctx.save();
            ctx.translate(-split, 0);
            ctx.beginPath();
            ctx.arc(40, 40, 20, Math.PI * 0.5, Math.PI * 1.5);
            ctx.stroke();
            ctx.restore();
            // Right half of coin circle
            ctx.save();
            ctx.translate(split, 0);
            ctx.beginPath();
            ctx.arc(40, 40, 20, -Math.PI * 0.5, Math.PI * 0.5);
            ctx.stroke();
            ctx.restore();
            // Zigzag crack line
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(40, 20);
            ctx.lineTo(37, 29);
            ctx.lineTo(43, 36);
            ctx.lineTo(38, 44);
            ctx.lineTo(42, 51);
            ctx.lineTo(40, 60);
            ctx.stroke();
            // Flickering "$" in center
            ctx.font = 'bold 13px sans-serif';
            ctx.fillStyle = danger;
            ctx.textAlign = 'center';
            ctx.globalAlpha = 0.3 + Math.abs(Math.sin(t * 4)) * 0.4;
            ctx.fillText('$', 40 - split * 0.3, 44);
            ctx.textAlign = 'start';
            ctx.globalAlpha = 1;
            break;

          case 'unlisted-good':
            // Solid filled coin with "$" center, pulsing radius, breathing glow ring
            var coinR = 20 + Math.sin(t * 2) * 2;
            // Outer breathing glow ring
            ctx.beginPath();
            ctx.arc(40, 40, 26 + Math.sin(t * 2) * 1.5, 0, Math.PI * 2);
            ctx.strokeStyle = green;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.18 + Math.sin(t * 2) * 0.08;
            ctx.stroke();
            // Solid filled coin
            ctx.beginPath();
            ctx.arc(40, 40, coinR, 0, Math.PI * 2);
            ctx.fillStyle = green;
            ctx.globalAlpha = 0.75;
            ctx.fill();
            // "$" symbol in center
            ctx.font = 'bold 18px sans-serif';
            ctx.fillStyle = getC('--bg-primary') || '#0a0a0a';
            ctx.textAlign = 'center';
            ctx.globalAlpha = 0.9;
            ctx.fillText('$', 40, 46);
            ctx.textAlign = 'start';
            ctx.globalAlpha = 1;
            break;

          // --- DCA LOT ACCURACY ---
          case 'dca-bad':
            // 6 dots scattered randomly, jittering — messy, unstable
            var dots = [[16, 22], [28, 50], [40, 30], [54, 58], [64, 18], [34, 44]];
            dots.forEach(function(d, i) {
              ctx.beginPath();
              var jx = d[0] + Math.sin(t * 1.5 + i * 2.1) * 4;
              var jy = d[1] + Math.cos(t * 1.5 + i * 2.1) * 4;
              ctx.arc(jx, jy, 5, 0, Math.PI * 2);
              ctx.fillStyle = danger;
              ctx.globalAlpha = 0.35 + Math.sin(t + i) * 0.2;
              ctx.fill();
            });
            ctx.globalAlpha = 1;
            break;

          case 'dca-good':
            // 6 dots perfectly aligned in a row, connected by a clean line
            var dcaY = 40;
            var dcaSpacing = 10;
            var dcaStart = 10;
            // Connecting line behind dots
            ctx.strokeStyle = green;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(dcaStart, dcaY);
            ctx.lineTo(dcaStart + 5 * dcaSpacing, dcaY);
            ctx.stroke();
            // Aligned dots, each pulsing in sequence
            for (var d = 0; d < 6; d++) {
              ctx.beginPath();
              ctx.arc(dcaStart + d * dcaSpacing, dcaY, 5, 0, Math.PI * 2);
              ctx.fillStyle = green;
              ctx.globalAlpha = 0.55 + Math.sin(t * 2.5 + d * 0.7) * 0.3;
              ctx.fill();
            }
            ctx.globalAlpha = 1;
            break;

          // --- COST BASIS METHODS ---
          case 'costbasis-bad':
            // One thin centered bar — looks inadequate
            ctx.fillStyle = danger;
            ctx.globalAlpha = 0.3 + Math.sin(t * 1.5) * 0.1;
            ctx.beginPath();
            ctx.roundRect(15, 35, 50, 8, 3);
            ctx.fill();
            ctx.globalAlpha = 1;
            break;

          case 'costbasis-good':
            // Three thick bars stacked vertically, filling the width, pulsing in sequence
            for (var b = 0; b < 3; b++) {
              ctx.fillStyle = green;
              ctx.globalAlpha = 0.55 + b * 0.15 + Math.sin(t * 2 + b * 0.9) * 0.15;
              ctx.beginPath();
              ctx.roundRect(10, 16 + b * 18, 60, 12, 3);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
            break;

          // --- VERIFICATION ---
          case 'verification-bad':
            // Two disconnected chain links drifting apart
            var vbDrift = Math.sin(t * 1.5) * 1.5;
            ctx.strokeStyle = danger;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.6;
            // Left link — pill shape, slightly tilted
            ctx.save();
            ctx.translate(26 - vbDrift, 40);
            ctx.rotate(-0.25);
            ctx.beginPath();
            ctx.roundRect(-12, -8, 24, 16, 8);
            ctx.stroke();
            ctx.restore();
            // Right link — pill shape, slightly tilted opposite
            ctx.save();
            ctx.translate(54 + vbDrift, 40);
            ctx.rotate(0.25);
            ctx.beginPath();
            ctx.roundRect(-12, -8, 24, 16, 8);
            ctx.stroke();
            ctx.restore();
            ctx.globalAlpha = 1;
            break;

          case 'verification-good':
            // Two interlocked chain links with glow at join + traveling spark
            ctx.strokeStyle = green;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.8;
            // Left link
            ctx.save();
            ctx.translate(30, 40);
            ctx.rotate(-0.2);
            ctx.beginPath();
            ctx.roundRect(-13, -8, 26, 16, 8);
            ctx.stroke();
            ctx.restore();
            // Right link (overlapping to interlock)
            ctx.save();
            ctx.translate(50, 40);
            ctx.rotate(0.2);
            ctx.beginPath();
            ctx.roundRect(-13, -8, 26, 16, 8);
            ctx.stroke();
            ctx.restore();
            // Glow at connection point
            ctx.beginPath();
            ctx.arc(40, 40, 5 + Math.sin(t * 2.5) * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = green;
            ctx.globalAlpha = 0.15 + Math.sin(t * 2.5) * 0.08;
            ctx.fill();
            // Traveling spark dot left-to-right
            var sparkX = 18 + ((t * 0.6) % 1) * 44;
            ctx.beginPath();
            ctx.arc(sparkX, 40, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = green;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
            break;

          // --- TAX OPTIMIZATION ---
          case 'optimization-bad':
            // Open padlock — lock body + raised/unlatched shackle that wobbles
            var wobbleShackle = Math.sin(t * 2.5) * 2;
            ctx.strokeStyle = danger;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.5;
            // Lock body
            ctx.beginPath();
            ctx.roundRect(24, 46, 32, 22, 4);
            ctx.stroke();
            // Open shackle (U-shape raised and offset to show unlocked)
            ctx.beginPath();
            ctx.arc(40, 38 + wobbleShackle, 10, Math.PI, 0);
            // Left leg goes down to lock body top-left
            ctx.moveTo(30, 38 + wobbleShackle);
            ctx.lineTo(30, 46);
            // Right leg is raised/unlatched — doesn't reach lock body
            ctx.moveTo(50, 38 + wobbleShackle);
            ctx.lineTo(50, 34 + wobbleShackle);
            ctx.stroke();
            ctx.globalAlpha = 1;
            break;

          case 'optimization-good':
            // Three stacks of coins (2, 3, 4) growing — top coin bounces
            ctx.fillStyle = green;
            ctx.strokeStyle = green;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            var stackDefs = [
              { x: 18, coins: 2 },
              { x: 40, coins: 3 },
              { x: 62, coins: 4 }
            ];
            var coinH = 7;
            var coinW = 18;
            var coinRy = 3;
            stackDefs.forEach(function(stack, si) {
              for (var ci = 0; ci < stack.coins; ci++) {
                var isTop = (ci === stack.coins - 1);
                var bounce = isTop ? Math.sin(t * 2.5 + si * 1.1) * 1.5 : 0;
                var coinY = 66 - ci * (coinH + 1) + bounce;
                ctx.globalAlpha = 0.55 + ci * 0.1 + (isTop ? Math.sin(t * 2.5 + si * 1.1) * 0.1 : 0);
                ctx.beginPath();
                ctx.ellipse(stack.x, coinY, coinW / 2, coinRy, 0, 0, Math.PI * 2);
                ctx.fill();
                // Coin body sides
                if (ci === 0 || !isTop) {
                  ctx.globalAlpha = 0.45;
                  ctx.beginPath();
                  ctx.moveTo(stack.x - coinW / 2, coinY);
                  ctx.lineTo(stack.x - coinW / 2, coinY + coinH);
                  ctx.moveTo(stack.x + coinW / 2, coinY);
                  ctx.lineTo(stack.x + coinW / 2, coinY + coinH);
                  ctx.stroke();
                }
              }
            });
            ctx.globalAlpha = 1;
            break;
        }

        animFrame = requestAnimationFrame(draw);
      }

      // Start when visible
      var obs = new IntersectionObserver(function(entries) {
        if (entries[0].isIntersecting && !started) {
          started = true;
          startTime = performance.now();
          draw();
        }
      }, { threshold: 0.3 });
      obs.observe(canvas);
    });
  })();
  


// ============================================================
// STRIPE CHECKOUT — wire pricing buttons to checkout API
// Uses event delegation so handlers survive React DOM regeneration
// ============================================================
(function() {
  document.addEventListener('click', async function(e) {
    var btn = e.target.closest('[data-plan]');
    if (!btn) return;
    e.preventDefault();

    var planKey = btn.getAttribute('data-plan');
    if (!planKey) return;

    // Disable button and show loading
    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = 'Redirecting...';

    try {
      var res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planKey: planKey }),
      });

      var data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        // Not authenticated — register first, then checkout
        window.location.href = '/register?plan=' + planKey;
      } else {
        // Show error to user
        alert(data.error || 'Something went wrong. Please try again.');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    } catch (err) {
      // Network error — redirect to register with plan param
      window.location.href = '/register?plan=' + planKey;
    }
  });
})();
