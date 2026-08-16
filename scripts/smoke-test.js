#!/usr/bin/env node

/**
 * CDP Tabanlı Smoke Test Script'i
 * 
 * Electron uygulamasının temel fonksiyonlarını otomatik test eder.
 * 
 * Kullanım:
 *   npm run test:smoke
 *   node scripts/smoke-test.js
 *   node scripts/smoke-test.js --verbose
 *   node scripts/smoke-test.js --screenshot
 * 
 * Gereksinimler:
 *   - Electron uygulaması çalışıyor olmalı (npm start)
 *   - CDP port 9222 açık olmalı
 */

import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

// ============================================================================
// Konfigürasyon
// ============================================================================

const CONFIG = {
  cdpPort: process.env.CDP_PORT || 9222,
  cdpHost: 'localhost',
  startupWait: 8000,      // Electron başlatma bekleme süresi (ms)
  testTimeout: 30000,     // Test timeout (ms)
  screenshotDir: resolve(PROJECT_ROOT, 'test-screenshots'),
};

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const TAKE_SCREENSHOTS = process.argv.includes('--screenshot') || process.argv.includes('-s');
const AUTO_START = process.argv.includes('--auto-start') || process.argv.includes('-a');

// ============================================================================
// Renk Kodları
// ============================================================================

const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

function log(message) {
  console.log(message);
}

function verbose(message) {
  if (VERBOSE) {
    console.log(colors.gray(`   ${message}`));
  }
}

// ============================================================================
// CDP Bağlantı Yardımcıları
// ============================================================================

async function checkCDPConnection() {
  try {
    const response = await fetch(`http://${CONFIG.cdpHost}:${CONFIG.cdpPort}/json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const targets = await response.json();
    return { connected: true, targets };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

async function waitForCDP(maxWait = CONFIG.startupWait) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    const status = await checkCDPConnection();
    if (status.connected) return status;
    await sleep(500);
  }
  
  return { connected: false, error: 'Timeout' };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// CDP Komut Çalıştırma (Basit HTTP tabanlı)
// ============================================================================

let wsConnection = null;
let messageId = 1;

async function connectWebSocket() {
  const status = await checkCDPConnection();
  if (!status.connected) {
    throw new Error('CDP bağlantısı yok');
  }
  
  const pageTarget = status.targets.find(t => t.type === 'page');
  if (!pageTarget) {
    throw new Error('Sayfa hedefi bulunamadı');
  }
  
  const WebSocket = (await import('ws')).default;
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    
    ws.on('open', () => {
      wsConnection = ws;
      resolve(ws);
    });
    
    ws.on('error', (err) => reject(err));
    
    setTimeout(() => {
      if (!wsConnection) {
        ws.terminate();
        reject(new Error('WebSocket timeout'));
      }
    }, 5000);
  });
}

async function sendCDPCommand(method, params = {}) {
  if (!wsConnection) {
    await connectWebSocket();
  }
  
  return new Promise((resolve, reject) => {
    const id = messageId++;
    
    const handler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          wsConnection.off('message', handler);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result || {});
          }
        }
      } catch {
        // JSON parse error, ignore
      }
    };
    
    wsConnection.on('message', handler);
    wsConnection.send(JSON.stringify({ id, method, params }));
    
    setTimeout(() => {
      wsConnection.off('message', handler);
      reject(new Error(`CDP command timeout: ${method}`));
    }, 10000);
  });
}

async function evaluateJS(expression) {
  await sendCDPCommand('Runtime.enable');
  const result = await sendCDPCommand('Runtime.evaluate', {
    expression,
    returnByValue: true,
  });
  
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'JS Error');
  }
  
  return result.result?.value;
}

async function takeScreenshot(name) {
  if (!TAKE_SCREENSHOTS) return null;
  
  if (!existsSync(CONFIG.screenshotDir)) {
    mkdirSync(CONFIG.screenshotDir, { recursive: true });
  }
  
  const result = await sendCDPCommand('Page.captureScreenshot', { format: 'png' });
  const filePath = resolve(CONFIG.screenshotDir, `${name}.png`);
  writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  
  return filePath;
}

// ============================================================================
// Test Tanımları
// ============================================================================

const tests = [
  {
    name: 'CDP Bağlantısı',
    run: async () => {
      const status = await checkCDPConnection();
      if (!status.connected) {
        throw new Error(`Bağlantı başarısız: ${status.error}`);
      }
      verbose(`${status.targets.length} hedef bulundu`);
      return true;
    },
  },
  
  {
    name: 'Sayfa Yüklendi',
    run: async () => {
      const readyState = await evaluateJS('document.readyState');
      if (readyState !== 'complete') {
        throw new Error(`Sayfa durumu: ${readyState}`);
      }
      verbose(`readyState: ${readyState}`);
      return true;
    },
  },
  
  {
    name: 'Sayfa Başlığı',
    run: async () => {
      const title = await evaluateJS('document.title');
      if (!title || title.length === 0) {
        throw new Error('Sayfa başlığı boş');
      }
      verbose(`Başlık: ${title}`);
      return true;
    },
  },
  
  {
    name: 'Ana Elementler',
    run: async () => {
      const checks = await evaluateJS(`
        ({
          body: document.body !== null,
          hasContent: document.body.children.length > 0,
        })
      `);
      
      if (!checks.body) throw new Error('Body elementi yok');
      if (!checks.hasContent) throw new Error('Sayfa içeriği boş');
      
      verbose(`Body children: ${checks.hasContent}`);
      return true;
    },
  },
  
  {
    name: 'JavaScript Hataları Yok',
    run: async () => {
      // window.onerror ile yakalanan hataları kontrol et
      const errors = await evaluateJS(`
        window.__testErrors || []
      `);
      
      if (errors && errors.length > 0) {
        throw new Error(`${errors.length} JS hatası: ${errors[0]}`);
      }
      
      verbose('JS hatası yok');
      return true;
    },
  },
  
  {
    name: 'Entrance Sayfası Elementleri',
    run: async () => {
      const url = await evaluateJS('window.location.href');
      
      // Sadece entrance sayfasındaysa kontrol et
      if (!url.includes('entrance') && !url.includes('index')) {
        verbose(`Farklı sayfa: ${url}`);
        return true;
      }
      
      const elements = await evaluateJS(`
        ({
          userPanel: !!document.querySelector('#user-panel, .user-panel, [class*="user"]'),
          accountSection: !!document.querySelector('#accounts, .accounts, [class*="account"]'),
          buttons: document.querySelectorAll('button').length,
        })
      `);
      
      verbose(`Butonlar: ${elements.buttons}, User Panel: ${elements.userPanel}`);
      return true;
    },
  },
  
  {
    name: 'Screenshot',
    run: async () => {
      if (!TAKE_SCREENSHOTS) {
        verbose('Screenshot atlandı (--screenshot flag yok)');
        return true;
      }
      
      const path = await takeScreenshot('smoke-test-final');
      verbose(`Screenshot: ${path}`);
      return true;
    },
  },
];

// ============================================================================
// Test Runner
// ============================================================================

async function runTests() {
  log(colors.blue('\n╔══════════════════════════════════════════════╗'));
  log(colors.blue('║           🧪 Smoke Test Suite                ║'));
  log(colors.blue('╚══════════════════════════════════════════════╝\n'));
  
  // CDP bağlantısını kontrol et
  log(colors.cyan('📡 CDP bağlantısı kontrol ediliyor...'));
  
  let status = await checkCDPConnection();
  
  if (!status.connected) {
    if (AUTO_START) {
      log(colors.yellow('   Electron başlatılıyor...'));
      spawn('npm', ['start'], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
      }).unref();
      
      log(colors.gray(`   ${CONFIG.startupWait / 1000}s bekleniyor...`));
      status = await waitForCDP();
    }
    
    if (!status.connected) {
      log(colors.red('\n❌ CDP bağlantısı kurulamadı!'));
      log(colors.gray('   Electron uygulamasını başlatın: npm start'));
      log(colors.gray('   veya --auto-start flag kullanın\n'));
      process.exit(1);
    }
  }
  
  log(colors.green('   ✅ Bağlantı aktif\n'));
  
  // WebSocket bağlantısını aç
  try {
    await connectWebSocket();
  } catch (error) {
    log(colors.red(`\n❌ WebSocket bağlantı hatası: ${error.message}\n`));
    process.exit(1);
  }
  
  // Testleri çalıştır
  log(colors.cyan('🧪 Testler çalıştırılıyor...\n'));
  
  const results = [];
  
  for (const test of tests) {
    const startTime = Date.now();
    
    try {
      await test.run();
      const duration = Date.now() - startTime;
      
      results.push({ name: test.name, success: true, duration });
      log(colors.green(`   ✅ ${test.name}`) + colors.gray(` (${duration}ms)`));
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      results.push({ name: test.name, success: false, error: error.message, duration });
      log(colors.red(`   ❌ ${test.name}: ${error.message}`) + colors.gray(` (${duration}ms)`));
    }
  }
  
  // WebSocket'i kapat
  if (wsConnection) {
    wsConnection.close();
  }
  
  // Sonuçları özetle
  log(colors.blue('\n══════════════════════════════════════════════'));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  if (failed === 0) {
    log(colors.green(`\n✅ Tüm testler başarılı! (${passed}/${tests.length})`));
  } else {
    log(colors.red(`\n❌ ${failed} test başarısız (${passed}/${tests.length} geçti)`));
    
    log(colors.yellow('\nBaşarısız testler:'));
    results.filter(r => !r.success).forEach(r => {
      log(colors.gray(`   - ${r.name}: ${r.error}`));
    });
  }
  
  log(colors.gray(`\nToplam süre: ${totalDuration}ms\n`));
  
  // Log dosyalarını kontrol et
  await checkLogs();
  
  process.exit(failed > 0 ? 1 : 0);
}

async function checkLogs() {
  const logsDir = resolve(PROJECT_ROOT, 'logs');
  
  if (!existsSync(logsDir)) {
    log(colors.gray('\n📁 Log klasörü bulunamadı'));
    return;
  }
  
  const sessions = readdirSync(logsDir).sort().reverse();
  
  if (sessions.length === 0) {
    log(colors.gray('\n📁 Log session bulunamadı'));
    return;
  }
  
  const latestSession = sessions[0];
  const errorLogPath = resolve(logsDir, latestSession, 'error.log');
  
  log(colors.cyan(`\n📋 Log Analizi (${latestSession}):`));
  
  if (existsSync(errorLogPath)) {
    const { readFileSync } = await import('fs');
    const errorContent = readFileSync(errorLogPath, 'utf-8').trim();
    
    if (errorContent.length > 0) {
      const errorLines = errorContent.split('\n').length;
      log(colors.yellow(`   ⚠️  error.log: ${errorLines} satır hata`));
      
      if (VERBOSE) {
        log(colors.gray('   Son hatalar:'));
        errorContent.split('\n').slice(-5).forEach(line => {
          log(colors.gray(`      ${line.substring(0, 80)}`));
        });
      }
    } else {
      log(colors.green('   ✅ error.log boş'));
    }
  } else {
    log(colors.green('   ✅ Hata logu yok'));
  }
}

// ============================================================================
// Ana Çalıştırma
// ============================================================================

runTests().catch(err => {
  console.error(colors.red(`\n❌ Test hatası: ${err.message}\n`));
  if (wsConnection) wsConnection.close();
  process.exit(1);
});
