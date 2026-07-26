// Pre-defined AT command response templates for mock serial

export type ResponseTemplate = {
  id: string;
  name: string;
  command: string;
  response: string;
};

export type ResponseTemplateGroup = {
  id: string;
  name: string;
  nameEn: string;
  responses: ResponseTemplate[];
};

export const RESPONSE_TEMPLATE_GROUPS: ResponseTemplateGroup[] = [
  {
    id: "4g_basic",
    name: "4G基础",
    nameEn: "4G Basic",
    responses: [
      { id: "4g_01", name: "网络注册", command: "AT+CEREG?", response: "+CEREG: 0,1\n\nOK" },
      { id: "4g_02", name: "GPRS附着", command: "AT+CGATT?", response: "+CGATT: 1\n\nOK" },
      { id: "4g_03", name: "信号强度", command: "AT+CSQ", response: "+CSQ: 25,0\n\nOK" },
      { id: "4g_04", name: "运营商", command: "AT+COPS?", response: '+COPS: 0,0,"China Mobile"\n\nOK' },
      { id: "4g_05", name: "设备型号", command: "AT+CGMM", response: "+CGMM: EC20\n\nOK" },
      { id: "4g_06", name: "固件版本", command: "AT+CGMR", response: "+CGMR: EG912UCAAAR01A09M08\n\nOK" },
      { id: "4g_07", name: "IMEI", command: "AT+CGSN", response: "+CGSN: 861234567890123\n\nOK" },
      { id: "4g_08", name: "功能状态", command: "AT+CFUN?", response: "+CFUN: 1\n\nOK" },
    ],
  },
  {
    id: "4g_network",
    name: "4G网络",
    nameEn: "4G Network",
    responses: [
      { id: "4gn_01", name: "PDP上下文", command: "AT+CGDCONT?", response: '+CGDCONT: 1,"IP","cmnet"\n\nOK' },
      { id: "4gn_02", name: "APN设置", command: 'AT+CGDCONT=1,"IP","cmnet"', response: "OK" },
      { id: "4gn_03", name: "激活PDP", command: "AT+CGACT=1,1", response: "OK" },
      { id: "4gn_04", name: "PDP状态", command: "AT+CGACT?", response: "+CGACT: 1,1\n\nOK" },
      { id: "4gn_05", name: "信号质量", command: "AT+CSQ", response: "+CSQ: 28,99\n\nOK" },
      { id: "4gn_06", name: "小区信息", command: "AT+CGPADDR=1", response: '+CGPADDR: 1,"10.10.10.10"\n\nOK' },
    ],
  },
  {
    id: "gps",
    name: "GPS",
    nameEn: "GPS",
    responses: [
      { id: "gps_01", name: "GPS开", command: "AT+QGPS=1", response: "OK" },
      { id: "gps_02", name: "GPS关", command: "AT+QGPS=0", response: "OK" },
      { id: "gps_03", name: "GPS状态", command: "AT+QGPS?", response: "+QGPS: 1\n\nOK" },
      { id: "gps_04", name: "定位信息", command: "AT+QGPSLOC=2", response: '+QGPSLOC: 0,31.123456,121.123456,1.5,28.5,2\n\nOK' },
      { id: "gps_05", name: "GNSS状态", command: "AT+QGPSINFO", response: "+QGPSINFO: 1,12,15,350\n\nOK" },
      { id: "gps_06", name: "NMEA输出", command: "AT+QGPSCFG=\"NMEA\",1", response: "OK" },
    ],
  },
  {
    id: "wifi",
    name: "WiFi",
    nameEn: "WiFi",
    responses: [
      { id: "wifi_01", name: "WiFi模式", command: "AT+CWMODE?", response: "+CWMODE: 1\n\nOK" },
      { id: "wifi_02", name: "设置模式", command: "AT+CWMODE=1", response: "OK" },
      { id: "wifi_03", name: "扫描AP", command: "AT+CWLAP", response: '+CWLAP: (3,"WiFi-5G",-45,"AA:BB:CC:DD:EE:FF",6)\n\nOK' },
      { id: "wifi_04", name: "连接WiFi", command: 'AT+CWJAP="MyWiFi","password"', response: "WIFI CONNECTED\n\nOK" },
      { id: "wifi_05", name: "WiFi状态", command: "AT+CWJAP?", response: '+CWJAP: "MyWiFi"\n\nOK' },
      { id: "wifi_06", name: "断开WiFi", command: "AT+CWQAP", response: "OK" },
      { id: "wifi_07", name: "IP地址", command: "AT+CIFSR", response: '+CIFSR:STAIP,"192.168.1.100"\n\nOK' },
    ],
  },
  {
    id: "bluetooth",
    name: "蓝牙",
    nameEn: "Bluetooth",
    responses: [
      { id: "bt_01", name: "蓝牙开", command: "AT+BTON", response: "OK" },
      { id: "bt_02", name: "蓝牙关", command: "AT+BTOFF", response: "OK" },
      { id: "bt_03", name: "扫描设备", command: "AT+INQM", response: '+INQM: 1,9,48\n\nOK' },
      { id: "bt_04", name: "配对", command: "AT+PAIR", response: "OK" },
      { id: "bt_05", name: "连接", command: "AT+CONN", response: "CONNECT OK" },
      { id: "bt_06", name: "断开", command: "AT+DISC", response: "OK" },
    ],
  },
  {
    id: "http",
    name: "HTTP",
    nameEn: "HTTP",
    responses: [
      { id: "http_01", name: "初始化", command: "AT+HTTPINIT", response: "OK" },
      { id: "http_02", name: "终止", command: "AT+HTTPTERM", response: "OK" },
      { id: "http_03", name: "设置URL", command: 'AT+HTTPPARA="URL","http://example.com"', response: "OK" },
      { id: "http_04", name: "GET请求", command: "AT+HTTPACTION=0", response: "+HTTPACTION: 0,200,100\n\nOK" },
      { id: "http_05", name: "读取数据", command: "AT+HTTPREAD", response: "+HTTPREAD: 100\nHello World\n\nOK" },
      { id: "http_06", name: "设置头", command: 'AT+HTTPPARA="CONTENT","application/json"', response: "OK" },
    ],
  },
  {
    id: "sms",
    name: "短信",
    nameEn: "SMS",
    responses: [
      { id: "sms_01", name: "文本模式", command: "AT+CMGF=1", response: "OK" },
      { id: "sms_02", name: "PDU模式", command: "AT+CMGF=0", response: "OK" },
      { id: "sms_03", name: "发送短信", command: 'AT+CMGS="+8613800138000"', response: "> " },
      { id: "sms_04", name: "短信列表", command: 'AT+CMGL="ALL"', response: '+CMGL: 0,"REC READ","+8613800138000",,"24/01/01,12:00:00+32",168,"Hello"\n\nOK' },
      { id: "sms_05", name: "读取短信", command: "AT+CMGR=1", response: '+CMGR: "REC READ","+8613800138000",,"24/01/01,12:00:00+32"\nHello\n\nOK' },
      { id: "sms_06", name: "删除短信", command: "AT+CMGD=1", response: "OK" },
    ],
  },
  {
    id: "power",
    name: "电源管理",
    nameEn: "Power",
    responses: [
      { id: "pwr_01", name: "功能状态", command: "AT+CFUN?", response: "+CFUN: 1\n\nOK" },
      { id: "pwr_02", name: "最小功能", command: "AT+CFUN=0", response: "OK" },
      { id: "pwr_03", name: "全功能", command: "AT+CFUN=1", response: "OK" },
      { id: "pwr_04", name: "重启", command: "AT+CFUN=1,1", response: "OK" },
      { id: "pwr_05", name: "关机", command: "AT+CPWROFF", response: "OK" },
      { id: "pwr_06", name: "日期时间", command: "AT+CCLK?", response: '+CCLK: "24/01/15,12:00:00+32"\n\nOK' },
    ],
  },
];

// Helper to get all responses as a flat array
export function getAllTemplateResponses(): ResponseTemplate[] {
  return RESPONSE_TEMPLATE_GROUPS.flatMap(group => group.responses);
}

// Helper to find a template by ID
export function findTemplateById(id: string): ResponseTemplate | undefined {
  return getAllTemplateResponses().find(t => t.id === id);
}
