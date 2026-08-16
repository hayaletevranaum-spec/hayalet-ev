export interface RepairSymptomCatalogModelFamily {
  label: string;
  symptoms: string[];
}

export interface RepairSymptomCatalogManufacturer {
  manufacturer: string;
  symptoms: string[];
  modelFamilies: RepairSymptomCatalogModelFamily[];
}

export interface RepairSymptomCatalogEntry {
  deviceType: string;
  symptoms: string[];
  manufacturers: RepairSymptomCatalogManufacturer[];
}

export const REPAIR_SYMPTOM_OPTIONS = [
  "No Power",
  "Boot Loop",
  "No Display",
  "No Backlight",
  "Fan Spin No Display",
  "Charging Fault",
  "Battery Drain",
  "Short to Ground",
  "Overcurrent",
  "No 5V_STBY",
  "No 3V3",
  "HDMI Dead",
  "USB Dead",
  "Audio Fault",
  "Wi-Fi / Bluetooth Fault",
  "Touch Not Working",
  "Liquid Damage",
  "Thermal Shutdown",
  "Intermittent Power",
  "BIOS / EC Corruption",
] as const;

export const REPAIR_SYMPTOM_CATALOG: RepairSymptomCatalogEntry[] = [
  {
    deviceType: "Laptop anakart",
    symptoms: [
      "No Power",
      "No Display",
      "No Backlight",
      "Fan Spin No Display",
      "Charging Fault",
      "Battery Drain",
      "Short to Ground",
      "No 3V3",
      "No 5V",
      "BIOS / EC Corruption",
      "Keyboard / Touchpad Fault",
      "USB-C PD Fault",
    ],
    manufacturers: [
      {
        manufacturer: "Apple",
        symptoms: ["No Chime", "No Image Internal Display", "USB-C Charging Fault", "Trackpad / Keyboard Not Detected"],
        modelFamilies: [
          { label: "MacBook Air", symptoms: ["No Backlight", "USB-C PD Fault", "Battery Not Detected"] },
          { label: "MacBook Pro", symptoms: ["Touch Bar Fault", "T2 / DFU Restore Required", "High Fan Spin"] },
        ],
      },
      {
        manufacturer: "Lenovo",
        symptoms: ["OneKey / Novo Boot Fault", "Keyboard Backlight Fault", "USB-C Dock Fault"],
        modelFamilies: [
          { label: "ThinkPad T / X / L series", symptoms: ["Docking Fault", "TrackPoint Fault", "BIOS Supervisor Lock"] },
          { label: "IdeaPad / Yoga", symptoms: ["Hinge Sensor Sleep Fault", "Touchscreen Fault", "Battery Drain"] },
        ],
      },
      {
        manufacturer: "Dell",
        symptoms: ["Amber Blink Code", "USB-C Charging Fault", "RTC Reset Loop"],
        modelFamilies: [
          { label: "Latitude", symptoms: ["Docking Fault", "No POST", "Keyboard Fault"] },
          { label: "Inspiron / Vostro", symptoms: ["Fan Error", "Charging Port Fault", "No Display"] },
          { label: "XPS", symptoms: ["No Backlight", "Thermal Throttle", "Battery Swelling"] },
        ],
      },
      {
        manufacturer: "HP",
        symptoms: ["Caps Lock Blink Code", "Smart AC Adapter Fault", "No POST"],
        modelFamilies: [
          { label: "EliteBook / ProBook", symptoms: ["Docking Fault", "BIOS Recovery", "Keyboard Fault"] },
          { label: "Pavilion / Envy", symptoms: ["Hinge Sensor Sleep Fault", "No Display", "Fan Error"] },
        ],
      },
    ],
  },
  {
    deviceType: "Masaustu anakart",
    symptoms: ["No POST", "No Power", "Boot Loop", "No Display", "RAM Training Fail", "PCIe Slot Fault", "USB Dead", "BIOS Flashback Required"],
    manufacturers: [
      { manufacturer: "ASUS", symptoms: ["Q-Code Halt", "BIOS Flashback Fault"], modelFamilies: [{ label: "Prime / TUF / ROG", symptoms: ["DRAM LED", "VGA LED", "AURA Header Fault"] }] },
      { manufacturer: "MSI", symptoms: ["EZ Debug LED", "M-Flash Fault"], modelFamilies: [{ label: "PRO / MAG / MPG", symptoms: ["CPU LED", "DRAM LED", "No POST"] }] },
      { manufacturer: "Gigabyte", symptoms: ["DualBIOS Recovery", "Q-Flash Fault"], modelFamilies: [{ label: "UD / Gaming / AORUS", symptoms: ["Boot Loop", "No Display", "PCIe Fault"] }] },
      { manufacturer: "ASRock", symptoms: ["Dr. Debug Code", "BIOS Recovery"], modelFamilies: [{ label: "Pro / Steel Legend / Phantom", symptoms: ["No POST", "RAM Training Fail"] }] },
    ],
  },
  {
    deviceType: "Cep telefonu",
    symptoms: ["No Power", "Boot Loop", "Charging Fault", "Battery Drain", "Touch Not Working", "No Backlight", "No Service", "Camera Fault", "Liquid Damage"],
    manufacturers: [
      { manufacturer: "Apple", symptoms: ["Stuck Apple Logo", "DFU Restore Error", "Face ID Fault"], modelFamilies: [{ label: "iPhone 8 / X / 11", symptoms: ["No Touch", "Baseband Fault", "Tristar / Hydra Fault"] }, { label: "iPhone 12 / 13 / 14 / 15", symptoms: ["No Wireless Charging", "Face ID Fault", "No Service"] }] },
      { manufacturer: "Samsung", symptoms: ["Download Mode Boot", "OLED No Image", "Charging Sub-board Fault"], modelFamilies: [{ label: "Galaxy S / Note", symptoms: ["S-Pen Fault", "No Service", "OLED Green Line"] }, { label: "Galaxy A / M", symptoms: ["Charging Board Fault", "No Touch", "Battery Drain"] }] },
      { manufacturer: "Xiaomi", symptoms: ["Fastboot Loop", "No Charging", "No Service"], modelFamilies: [{ label: "Redmi / POCO", symptoms: ["PMIC Short", "Charging Sub-board Fault", "Boot Loop"] }, { label: "Mi / Xiaomi numbered", symptoms: ["No Camera", "No Touch", "Battery Drain"] }] },
    ],
  },
  {
    deviceType: "Tablet",
    symptoms: ["No Power", "Charging Fault", "Battery Drain", "Touch Not Working", "No Backlight", "No Display", "Boot Loop", "Wi-Fi / Bluetooth Fault"],
    manufacturers: [
      { manufacturer: "Apple", symptoms: ["DFU Restore Error", "Pencil Pairing Fault"], modelFamilies: [{ label: "iPad / iPad Air", symptoms: ["Touch Digitizer Fault", "No Backlight", "Charging Port Fault"] }, { label: "iPad Pro", symptoms: ["Face ID Fault", "USB-C Charging Fault", "No Image"] }] },
      { manufacturer: "Samsung", symptoms: ["S-Pen Fault", "OLED No Image"], modelFamilies: [{ label: "Galaxy Tab A / S", symptoms: ["Charging Board Fault", "No Touch", "Battery Drain"] }] },
    ],
  },
  {
    deviceType: "TV ana kart",
    symptoms: ["No Power", "Boot Loop", "No Display", "No Backlight", "HDMI Dead", "Audio Fault", "Remote Not Responding", "Standby LED Blink"],
    manufacturers: [
      { manufacturer: "Samsung", symptoms: ["One Connect Fault", "Standby Blink Code"], modelFamilies: [{ label: "Samsung LED / QLED main", symptoms: ["HDMI Dead", "No T-Con Enable", "Boot Loop"] }] },
      { manufacturer: "LG", symptoms: ["Magic Remote Fault", "No WebOS Boot"], modelFamilies: [{ label: "LG LED / OLED main", symptoms: ["No Backlight Enable", "HDMI Dead", "Audio Fault"] }] },
      { manufacturer: "Vestel / Regal / Finlux / Toshiba", symptoms: ["Red LED Blink", "Panel Option Wrong"], modelFamilies: [{ label: "Vestel platform main", symptoms: ["No Display", "Boot Loop", "No Remote"] }] },
    ],
  },
  {
    deviceType: "TV guc karti / PSU",
    symptoms: ["No Power", "No 5V_STBY", "Standby Pulsing", "Backlight Flash", "PFC Not Starting", "Overcurrent", "Fuse Blown"],
    manufacturers: [
      { manufacturer: "Samsung", symptoms: ["Relay Click", "BLU Overcurrent"], modelFamilies: [{ label: "Samsung BN44 PSU", symptoms: ["No 13V", "No PFC", "Backlight Flash"] }] },
      { manufacturer: "LG", symptoms: ["No 24V", "PFC Low"], modelFamilies: [{ label: "LG EAY / LGP PSU", symptoms: ["No Standby", "Backlight Overcurrent", "Fuse Blown"] }] },
    ],
  },
  {
    deviceType: "Monitor karti",
    symptoms: ["No Power", "No Display", "No Backlight", "HDMI Dead", "DisplayPort Dead", "OSD Not Working", "Flicker", "Color Distortion"],
    manufacturers: [],
  },
  {
    deviceType: "Oyun konsolu",
    symptoms: ["No Power", "No Display", "HDMI Dead", "Overheating", "Fan Spin No Display", "Storage Not Detected", "Controller Pairing Fault", "Disc Drive Fault"],
    manufacturers: [
      { manufacturer: "Sony", symptoms: ["Blue Light of Death", "Safe Mode Loop"], modelFamilies: [{ label: "PlayStation 4 / 5", symptoms: ["HDMI Retimer Fault", "APU Overheat", "Disc Drive Fault"] }] },
      { manufacturer: "Microsoft", symptoms: ["No Chime", "Green Screen Loop"], modelFamilies: [{ label: "Xbox One / Series", symptoms: ["HDMI Retimer Fault", "Power Rail Short", "Storage Fault"] }] },
      { manufacturer: "Nintendo", symptoms: ["No Dock Video", "Joy-Con Pairing Fault"], modelFamilies: [{ label: "Switch / Switch Lite", symptoms: ["USB-C Port Fault", "M92T36 Fault", "No Charge"] }] },
    ],
  },
  {
    deviceType: "GPU",
    symptoms: ["No Display", "Artifacts", "Fan Spin No Display", "Overheating", "PCIe Not Detected", "VRAM Fault", "Short to Ground", "Driver Crash"],
    manufacturers: [],
  },
  {
    deviceType: "Guc kaynagi / adaptor",
    symptoms: ["No Output", "Voltage Drop", "Overcurrent", "Fuse Blown", "Intermittent Power", "No Load Regulation", "High Ripple"],
    manufacturers: [],
  },
  {
    deviceType: "Yazici / tarayici",
    symptoms: ["No Power", "Paper Jam", "Scanner Fault", "Motor Stall", "USB Dead", "Wi-Fi Fault", "Poor Print Quality", "Cartridge Not Detected"],
    manufacturers: [],
  },
  {
    deviceType: "Ag cihazi",
    symptoms: ["No Power", "No Link", "PoE Fault", "Port Dead", "Boot Loop", "Firmware Corruption", "Wi-Fi Fault", "Overheating"],
    manufacturers: [],
  },
  {
    deviceType: "IoT / gomulu",
    symptoms: ["No Power", "Boot Loop", "Firmware Corruption", "Sensor Fault", "No Communication", "Short to Ground", "Battery Drain", "Intermittent Power"],
    manufacturers: [],
  },
];
