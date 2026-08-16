export const REPAIR_UNKNOWN_VALUE = "Bilinmiyor";
export const REPAIR_OTHER_DEVICE_TYPE = "Diger";

export interface RepairDeviceCatalogModelFamily {
  label: string;
  boardCodePatterns: string[];
}

export interface RepairDeviceCatalogManufacturer {
  manufacturer: string;
  modelFamilies: RepairDeviceCatalogModelFamily[];
  boardCodePatterns: string[];
}

export interface RepairDeviceCatalogEntry {
  deviceType: string;
  manufacturers: RepairDeviceCatalogManufacturer[];
  boardCodePatterns: string[];
}

export const REPAIR_DEVICE_CATALOG: RepairDeviceCatalogEntry[] = [
  {
    deviceType: "Laptop anakart",
    boardCodePatterns: ["LA-*", "DA0*", "NM-*", "BA41-*", "6050A*", "820-*"],
    manufacturers: [
      {
        manufacturer: "Apple",
        boardCodePatterns: ["820-*", "A* logic board"],
        modelFamilies: [
          { label: "MacBook Air", boardCodePatterns: ["820-00165", "820-01521", "820-02016"] },
          { label: "MacBook Pro", boardCodePatterns: ["820-00840", "820-01041", "820-01987"] },
        ],
      },
      {
        manufacturer: "Lenovo",
        boardCodePatterns: ["NM-*", "LA-*", "5B20*"],
        modelFamilies: [
          { label: "ThinkPad T / X / L series", boardCodePatterns: ["NM-*", "LA-G*", "5B20*"] },
          { label: "IdeaPad / Yoga", boardCodePatterns: ["NM-*", "LCFC*", "BY* NM-*"] },
        ],
      },
      {
        manufacturer: "Dell",
        boardCodePatterns: ["LA-*", "DA0*", "CN-0*"],
        modelFamilies: [
          { label: "Latitude", boardCodePatterns: ["LA-*", "DA0*", "CN-0*"] },
          { label: "Inspiron / Vostro", boardCodePatterns: ["LA-*", "0* motherboard"] },
          { label: "XPS", boardCodePatterns: ["LA-*", "CN-0*"] },
        ],
      },
      {
        manufacturer: "HP",
        boardCodePatterns: ["DA0*", "LA-*", "6050A*"],
        modelFamilies: [
          { label: "EliteBook / ProBook", boardCodePatterns: ["6050A*", "DA0*", "LA-*"] },
          { label: "Pavilion / Envy", boardCodePatterns: ["DA0*", "LA-*", "L* board"] },
        ],
      },
      {
        manufacturer: "ASUS",
        boardCodePatterns: ["X* main board", "UX*", "GL*", "60NB*"],
        modelFamilies: [
          { label: "VivoBook / ZenBook", boardCodePatterns: ["X*", "UX*", "60NB*"] },
          { label: "ROG / TUF", boardCodePatterns: ["GL*", "FX*", "FA*", "60NR*"] },
        ],
      },
      {
        manufacturer: "Acer",
        boardCodePatterns: ["LA-*", "DA0*", "NB.*"],
        modelFamilies: [
          { label: "Aspire / Swift", boardCodePatterns: ["LA-*", "DA0*", "NB.*"] },
          { label: "Nitro / Predator", boardCodePatterns: ["LA-*", "DA0*", "NB.Q*"] },
        ],
      },
    ],
  },
  {
    deviceType: "Masaustu anakart",
    boardCodePatterns: ["ATX", "mATX", "ITX", "OEM board", "H*", "B*", "Z*", "A*"],
    manufacturers: [
      {
        manufacturer: "ASUS",
        boardCodePatterns: ["PRIME-*", "ROG-*", "TUF-*"],
        modelFamilies: [
          { label: "Prime / TUF / ROG", boardCodePatterns: ["PRIME-*", "TUF-*", "ROG-*"] },
        ],
      },
      {
        manufacturer: "MSI",
        boardCodePatterns: ["MS-*", "B*", "Z*"],
        modelFamilies: [
          { label: "PRO / MAG / MPG", boardCodePatterns: ["MS-*", "B*", "Z*"] },
        ],
      },
      {
        manufacturer: "Gigabyte",
        boardCodePatterns: ["GA-*", "B*", "Z*", "AORUS"],
        modelFamilies: [
          { label: "UD / Gaming / AORUS", boardCodePatterns: ["GA-*", "B*", "Z*", "AORUS"] },
        ],
      },
      {
        manufacturer: "ASRock",
        boardCodePatterns: ["B*", "Z*", "A*", "H*"],
        modelFamilies: [
          { label: "Pro / Steel Legend / Phantom", boardCodePatterns: ["B*", "Z*", "A*", "H*"] },
        ],
      },
      {
        manufacturer: "OEM",
        boardCodePatterns: ["Dell 0*", "HP *", "Lenovo *"],
        modelFamilies: [
          { label: "Dell / HP / Lenovo desktop", boardCodePatterns: ["Dell 0*", "HP *", "Lenovo *"] },
        ],
      },
    ],
  },
  {
    deviceType: "Cep telefonu",
    boardCodePatterns: ["logic board", "main board", "charging sub-board", "RF board"],
    manufacturers: [
      {
        manufacturer: "Apple",
        boardCodePatterns: ["iPhone logic board", "820-*", "A* board"],
        modelFamilies: [
          { label: "iPhone 8 / X / 11", boardCodePatterns: ["820-*", "A186*", "A19*"] },
          { label: "iPhone 12 / 13 / 14 / 15", boardCodePatterns: ["820-*", "A21*", "A24*", "A26*"] },
        ],
      },
      {
        manufacturer: "Samsung",
        boardCodePatterns: ["GH82-*", "GH96-*", "SM-* main"],
        modelFamilies: [
          { label: "Galaxy S / Note", boardCodePatterns: ["SM-G*", "SM-N*", "GH82-*"] },
          { label: "Galaxy A / M", boardCodePatterns: ["SM-A*", "SM-M*", "GH96-*"] },
        ],
      },
      {
        manufacturer: "Xiaomi",
        boardCodePatterns: ["M200*", "M210*", "main FPC"],
        modelFamilies: [
          { label: "Redmi / POCO", boardCodePatterns: ["M20*", "M21*", "charging board"] },
          { label: "Mi / Xiaomi numbered", boardCodePatterns: ["M20*", "M21*", "main board"] },
        ],
      },
      {
        manufacturer: "Huawei",
        boardCodePatterns: ["HL*", "ANA-*", "VOG-*"],
        modelFamilies: [
          { label: "P / Mate / Nova", boardCodePatterns: ["ANA-*", "VOG-*", "JNY-*"] },
        ],
      },
      {
        manufacturer: "Oppo / Realme",
        boardCodePatterns: ["CPH*", "RMX*", "sub-board"],
        modelFamilies: [
          { label: "Oppo A / Reno", boardCodePatterns: ["CPH*", "main board", "sub-board"] },
          { label: "Realme numbered", boardCodePatterns: ["RMX*", "main board", "sub-board"] },
        ],
      },
    ],
  },
  {
    deviceType: "Tablet",
    boardCodePatterns: ["logic board", "main board", "charging board", "FPC board"],
    manufacturers: [
      {
        manufacturer: "Apple",
        boardCodePatterns: ["iPad logic board", "820-*", "A* board"],
        modelFamilies: [
          { label: "iPad / iPad Air", boardCodePatterns: ["820-*", "A14*", "A21*"] },
          { label: "iPad Pro", boardCodePatterns: ["820-*", "A18*", "A22*"] },
        ],
      },
      {
        manufacturer: "Samsung",
        boardCodePatterns: ["GH82-*", "SM-T*"],
        modelFamilies: [
          { label: "Galaxy Tab A / S", boardCodePatterns: ["SM-T*", "GH82-*"] },
        ],
      },
      {
        manufacturer: "Lenovo",
        boardCodePatterns: ["TB-*", "ZA* board"],
        modelFamilies: [
          { label: "Lenovo Tab", boardCodePatterns: ["TB-*", "ZA*"] },
        ],
      },
      {
        manufacturer: "Huawei",
        boardCodePatterns: ["AGS-*", "BAH-*", "MRX-*"],
        modelFamilies: [
          { label: "MediaPad / MatePad", boardCodePatterns: ["AGS-*", "BAH-*", "MRX-*"] },
        ],
      },
    ],
  },
  {
    deviceType: "TV ana kart",
    boardCodePatterns: ["BN41-*", "EAX*", "17MB*", "715G*", "1-982-*"],
    manufacturers: [
      {
        manufacturer: "Samsung",
        boardCodePatterns: ["BN41-*", "BN94-*"],
        modelFamilies: [
          { label: "Samsung LED / QLED main", boardCodePatterns: ["BN41-*", "BN94-*"] },
        ],
      },
      {
        manufacturer: "LG",
        boardCodePatterns: ["EAX*", "EBT*", "EBO*"],
        modelFamilies: [
          { label: "LG LED / OLED main", boardCodePatterns: ["EAX*", "EBT*", "EBO*"] },
        ],
      },
      {
        manufacturer: "Vestel / Regal / Finlux / Toshiba",
        boardCodePatterns: ["17MB*", "232*", "234*"],
        modelFamilies: [
          { label: "Vestel platform main", boardCodePatterns: ["17MB*", "232*", "234*"] },
        ],
      },
      {
        manufacturer: "Philips / TP Vision",
        boardCodePatterns: ["715G*", "TPM*"],
        modelFamilies: [
          { label: "Philips main", boardCodePatterns: ["715G*", "TPM*"] },
        ],
      },
      {
        manufacturer: "Sony",
        boardCodePatterns: ["1-982-*", "A-*", "BAL board"],
        modelFamilies: [
          { label: "Bravia main", boardCodePatterns: ["1-982-*", "A-*", "BAL"] },
        ],
      },
    ],
  },
  {
    deviceType: "TV guc karti / PSU",
    boardCodePatterns: ["BN44-*", "EAX*", "17IPS*", "715G*", "DPS-*", "LGP*"],
    manufacturers: [
      {
        manufacturer: "Samsung",
        boardCodePatterns: ["BN44-*"],
        modelFamilies: [
          { label: "Samsung power supply", boardCodePatterns: ["BN44-*"] },
        ],
      },
      {
        manufacturer: "LG",
        boardCodePatterns: ["EAX*", "LGP*", "EAY*"],
        modelFamilies: [
          { label: "LG power / LED driver", boardCodePatterns: ["EAX*", "LGP*", "EAY*"] },
        ],
      },
      {
        manufacturer: "Vestel / Regal / Finlux / Toshiba",
        boardCodePatterns: ["17IPS*", "17PW*"],
        modelFamilies: [
          { label: "Vestel power platform", boardCodePatterns: ["17IPS*", "17PW*"] },
        ],
      },
      {
        manufacturer: "Philips / TP Vision",
        boardCodePatterns: ["715G*", "PLTV*"],
        modelFamilies: [
          { label: "Philips power supply", boardCodePatterns: ["715G*", "PLTV*"] },
        ],
      },
      {
        manufacturer: "Sony",
        boardCodePatterns: ["DPS-*", "APS-*"],
        modelFamilies: [
          { label: "Sony power supply", boardCodePatterns: ["DPS-*", "APS-*"] },
        ],
      },
    ],
  },
  {
    deviceType: "Monitor karti",
    boardCodePatterns: ["715G*", "BN41-*", "EAX*", "4H.*", "ILIF-*"],
    manufacturers: [
      {
        manufacturer: "Dell",
        boardCodePatterns: ["4H.*", "715G*", "ILIF-*"],
        modelFamilies: [
          { label: "UltraSharp / P series", boardCodePatterns: ["4H.*", "715G*", "ILIF-*"] },
        ],
      },
      {
        manufacturer: "LG",
        boardCodePatterns: ["EAX*", "LGP*"],
        modelFamilies: [
          { label: "LG monitor main / power", boardCodePatterns: ["EAX*", "LGP*"] },
        ],
      },
      {
        manufacturer: "Samsung",
        boardCodePatterns: ["BN41-*", "BN44-*"],
        modelFamilies: [
          { label: "Samsung monitor main / power", boardCodePatterns: ["BN41-*", "BN44-*"] },
        ],
      },
      {
        manufacturer: "ASUS / Acer",
        boardCodePatterns: ["715G*", "4H.*", "main board"],
        modelFamilies: [
          { label: "Gaming / office monitor", boardCodePatterns: ["715G*", "4H.*", "main board"] },
        ],
      },
    ],
  },
  {
    deviceType: "Oyun konsolu",
    boardCodePatterns: ["EDM-*", "SAB-*", "X86*", "HAC-CPU-*", "HDH-CPU-*"],
    manufacturers: [
      {
        manufacturer: "Sony",
        boardCodePatterns: ["SAB-*", "EDM-*", "JDM-*"],
        modelFamilies: [
          { label: "PlayStation 4", boardCodePatterns: ["SAB-*", "JDM-*", "CUH-*"] },
          { label: "PlayStation 5", boardCodePatterns: ["EDM-*", "CFI-*"] },
        ],
      },
      {
        manufacturer: "Microsoft",
        boardCodePatterns: ["X86*", "X89*", "X90*"],
        modelFamilies: [
          { label: "Xbox One", boardCodePatterns: ["X86*", "X87*"] },
          { label: "Xbox Series S / X", boardCodePatterns: ["X89*", "X90*"] },
        ],
      },
      {
        manufacturer: "Nintendo",
        boardCodePatterns: ["HAC-CPU-*", "HDH-CPU-*", "HEG-CPU-*"],
        modelFamilies: [
          { label: "Switch / Switch Lite / OLED", boardCodePatterns: ["HAC-CPU-*", "HDH-CPU-*", "HEG-CPU-*"] },
        ],
      },
    ],
  },
  {
    deviceType: "GPU",
    boardCodePatterns: ["PG*", "MS-V*", "GV-*", "Radeon PCB", "GeForce PCB"],
    manufacturers: [
      {
        manufacturer: "NVIDIA / Board partner",
        boardCodePatterns: ["PG*", "MS-V*", "GV-N*", "ROG-STRIX-*"],
        modelFamilies: [
          { label: "GeForce GTX / RTX", boardCodePatterns: ["PG*", "MS-V*", "GV-N*", "RTX*"] },
        ],
      },
      {
        manufacturer: "AMD / Board partner",
        boardCodePatterns: ["GV-R*", "Radeon PCB", "Sapphire *"],
        modelFamilies: [
          { label: "Radeon RX", boardCodePatterns: ["GV-R*", "RX*", "Sapphire*"] },
        ],
      },
    ],
  },
  {
    deviceType: "Guc kaynagi / adaptor",
    boardCodePatterns: ["DPS-*", "FSP*", "PA-*", "ADP-*", "Delta *", "Lite-On *"],
    manufacturers: [
      {
        manufacturer: "Delta / Lite-On / Chicony",
        boardCodePatterns: ["DPS-*", "PA-*", "ADP-*"],
        modelFamilies: [
          { label: "Laptop adaptor", boardCodePatterns: ["PA-*", "ADP-*", "DPS-*"] },
        ],
      },
      {
        manufacturer: "FSP / Seasonic / Corsair / Cooler Master",
        boardCodePatterns: ["FSP*", "DPS-*", "CWT*", "GP*"],
        modelFamilies: [
          { label: "ATX PSU", boardCodePatterns: ["FSP*", "DPS-*", "CWT*", "GP*"] },
        ],
      },
    ],
  },
  {
    deviceType: "Yazici / tarayici",
    boardCodePatterns: ["formatter board", "logic board", "power board", "carriage board"],
    manufacturers: [
      {
        manufacturer: "HP",
        boardCodePatterns: ["formatter board", "RM*", "CE*"],
        modelFamilies: [
          { label: "LaserJet / OfficeJet", boardCodePatterns: ["formatter board", "RM*", "CE*"] },
        ],
      },
      {
        manufacturer: "Canon / Epson / Brother",
        boardCodePatterns: ["main board", "power board", "carriage board"],
        modelFamilies: [
          { label: "Inkjet / laser", boardCodePatterns: ["main board", "power board", "carriage board"] },
        ],
      },
    ],
  },
  {
    deviceType: "Ag cihazi",
    boardCodePatterns: ["router main", "switch board", "PoE board", "radio board"],
    manufacturers: [
      {
        manufacturer: "TP-Link / Keenetic / Zyxel",
        boardCodePatterns: ["router main", "switch board", "power board"],
        modelFamilies: [
          { label: "Router / modem", boardCodePatterns: ["router main", "power board"] },
        ],
      },
      {
        manufacturer: "Ubiquiti / MikroTik",
        boardCodePatterns: ["PoE board", "RouterBOARD", "radio board"],
        modelFamilies: [
          { label: "PoE switch / radio / router", boardCodePatterns: ["PoE board", "RouterBOARD", "radio board"] },
        ],
      },
    ],
  },
  {
    deviceType: "IoT / gomulu",
    boardCodePatterns: ["ESP32", "ESP8266", "STM32", "Arduino shield", "Raspberry Pi HAT"],
    manufacturers: [
      {
        manufacturer: "Generic / maker board",
        boardCodePatterns: ["ESP32", "ESP8266", "STM32", "RP2040"],
        modelFamilies: [
          { label: "MCU dev board", boardCodePatterns: ["ESP32", "ESP8266", "STM32", "RP2040"] },
          { label: "Custom embedded board", boardCodePatterns: ["custom PCB", "rev *", "v*.*"] },
        ],
      },
      {
        manufacturer: "Raspberry Pi / Arduino",
        boardCodePatterns: ["Raspberry Pi", "Arduino", "HAT", "shield"],
        modelFamilies: [
          { label: "Single board computer / shield", boardCodePatterns: ["Raspberry Pi", "Arduino", "HAT", "shield"] },
        ],
      },
    ],
  },
];

export const REPAIR_DEVICE_TYPE_OPTIONS: string[] = [
  ...REPAIR_DEVICE_CATALOG.map((entry) => entry.deviceType),
  REPAIR_OTHER_DEVICE_TYPE,
  REPAIR_UNKNOWN_VALUE,
];
