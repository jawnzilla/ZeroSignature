// DOM HUD — health, stamina, detection, ammo, intel, objective, messages, upgrade menu.
import { UPGRADE_DEFS } from '../config.js';

export class HUD {
  constructor(container) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div id="crosshair"></div>
      <div id="detect-wrap"><div id="detect-label">!</div><div id="detect-bar"><div id="detect-fill"></div></div></div>
      <div id="bars">
        <div class="bar-row"><span class="bar-label">HP</span><div class="bar"><div id="hp-fill"></div></div></div>
        <div class="bar-row"><span class="bar-label">ST</span><div class="bar"><div id="st-fill"></div></div></div>
      </div>
      <div id="weapon">AMMO <span id="ammo">--</span> / <span id="mag">--</span><span id="supp">[SUPPRESSED]</span></div>
      <div id="intel">INTEL <span id="intel-count">0</span></div>
      <div id="objective"></div>
      <div id="message"></div>
      <div id="controls">
        WASD move · Shift sprint · Ctrl crouch · Click shoot · R reload · T toggle suppressor<br>
        Tab upgrades · G new mission
      </div>
      <div id="alert-vignette"></div>
      <div id="damage-flash"></div>
      <div id="upgrade-panel" class="hidden">
        <h2>INTEL &amp; UPGRADES</h2>
        <p class="sub">Intel: <span id="up-intel">0</span></p>
        <div id="upgrades"></div>
        <p class="hint">Press Tab to close</p>
      </div>
      <div id="gameover" class="hidden"></div>
    `;
    container.appendChild(this.el);
    this.els = {
      hp: this.el.querySelector('#hp-fill'),
      st: this.el.querySelector('#st-fill'),
      detectFill: this.el.querySelector('#detect-fill'),
      detectWrap: this.el.querySelector('#detect-wrap'),
      ammo: this.el.querySelector('#ammo'),
      mag: this.el.querySelector('#mag'),
      supp: this.el.querySelector('#supp'),
      intel: this.el.querySelector('#intel-count'),
      objective: this.el.querySelector('#objective'),
      message: this.el.querySelector('#message'),
      alertVignette: this.el.querySelector('#alert-vignette'),
      upgradePanel: this.el.querySelector('#upgrade-panel'),
      upIntel: this.el.querySelector('#up-intel'),
      upgrades: this.el.querySelector('#upgrades'),
      gameover: this.el.querySelector('#gameover'),
    };
    this.msgTimer = 0;
  }

  update(state) {
    const p = state.player;
    this.els.hp.style.width = `${Math.max(0, p.health) / p.maxHealth * 100}%`;
    this.els.hp.style.background = p.health / p.maxHealth < 0.3 ? '#ff3b30' : '#3ddc84';
    this.els.st.style.width = `${p.stamina / p.maxStamina * 100}%`;
    // detection
    const det = state.maxDet;
    this.els.detectFill.style.width = `${det}%`;
    this.els.detectWrap.classList.toggle('active', det > 4);
    this.els.detectFill.style.background = det >= 100 ? '#ff3b30' : det > 60 ? '#ff9f0a' : '#ffd60a';
    // weapon
    this.els.ammo.textContent = p.weapon.ammo;
    this.els.mag.textContent = p.weapon.mag;
    this.els.supp.style.display = (p.weapon.suppressed || p.upgrades.silencer > 0) ? 'inline' : 'none';
    // intel
    this.els.intel.textContent = p.intel;
    // objective
    if (state.missionComplete) this.els.objective.textContent = '✓ SIGNATURE SECURED — press G for new mission';
    else this.els.objective.textContent = state.objectiveText || '';
    // alert vignette
    const intensity = Math.min(1, det / 100) * (state.anyCombat ? 0.9 : 0.45);
    this.els.alertVignette.style.opacity = intensity;
  }

  message(text, dur = 2.5) {
    this.els.message.textContent = text;
    this.els.message.classList.add('show');
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.els.message.classList.remove('show'), dur * 1000);
  }

  flashDamage() {
    const el = this.el.querySelector('#damage-flash');
    el.classList.remove('hit');
    void el.offsetWidth; // restart animation
    el.classList.add('hit');
  }

  renderUpgrades(player, onBuy) {
    this.els.upIntel.textContent = player.intel;
    this.els.upgrades.innerHTML = '';
    for (const def of UPGRADE_DEFS) {
      const lvl = player.upgrades[def.id];
      const row = document.createElement('div');
      row.className = 'up-row';
      const can = lvl < def.max;
      const cost = CONFIG_cost(def, lvl);
      row.innerHTML = `
        <div class="up-info">
          <div class="up-name">${def.name} <span class="up-lvl">${'■'.repeat(lvl)}${'□'.repeat(def.max - lvl)}</span></div>
          <div class="up-desc">${def.desc}</div>
        </div>
        <button class="up-buy" ${can ? '' : 'disabled'} data-id="${def.id}">${can ? `$${cost}` : 'MAX'}</button>
      `;
      const btn = row.querySelector('.up-buy');
      btn.addEventListener('click', () => {
        if (can && player.intel >= cost) { onBuy(def.id); this.renderUpgrades(player, onBuy); }
      });
      this.els.upgrades.appendChild(row);
    }
  }

  toggleUpgradePanel(show, player, onBuy) {
    this.els.upgradePanel.classList.toggle('hidden', !show);
    if (show) this.renderUpgrades(player, onBuy);
  }
  isUpgradeOpen() { return !this.els.upgradePanel.classList.contains('hidden'); }

  showGameOver() {
    this.els.gameover.classList.remove('hidden');
    this.els.gameover.innerHTML = `
      <h2>MISSION FAILED</h2>
      <p>You were compromised.</p>
      <button id="retry-btn">NEW MISSION</button>`;
    this.els.gameover.querySelector('#retry-btn').addEventListener('click', () => {
      this.els.gameover.classList.add('hidden');
      location.reload();
    });
  }
}

function CONFIG_cost(def, lvl) { return [1, 2, 3][lvl] ?? 3; }
