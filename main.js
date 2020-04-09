'use strict';
const utils = require('@iobroker/adapter-core');
const net = require('net');
let sanext;
let adapter, pollAllowed = false, isOnline = false, reconnectTimeOut = null, timeoutPoll = null;
let pollingInterval = null;
let iter = 0;
let cmd = [];

const addr = [0x00, 0x64, 0x50, 0x92];

function startAdapter(options){
    return adapter = utils.adapter(Object.assign({}, options, {
        systemConfig: true,
        name:         'sanext',
        ready:        main,
        unload:       (callback) => {
            clearTimeout(timeoutPoll);
            clearTimeout(reconnectTimeOut);
            clearTimeout(pollingInterval);
            if (sanext) sanext.destroy();
            try {
                adapter.log.debug('cleaned everything up...');
                callback();
            } catch (e) {
                callback();
            }
        },
        stateChange:  (id, state) => {
            if (id && state && !state.ack){
                adapter.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                const arr = id.split('.');
                const sn = parseInt(arr[2]);
                id = arr[arr.length - 1];
            }
        },
        message:      obj => {
            if (typeof obj === 'object' && obj.command){
                adapter.log.debug(`message ******* ${JSON.stringify(obj)}`);
            } else {
                adapter.log.debug(`message x ${obj.command}`);
            }
        }
    }));
}

const func = {
    readEnergy: function (cmd, response){
        adapter.log.info('readEnergy - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('Energy', +parseFloat(response.readFloatLE(6)).toFixed(4));
    },
    tempIn:     function (cmd, response){
        adapter.log.info('tempIn - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('tempIn', +parseFloat(response.readFloatLE(6)).toFixed(4));
    },
    tempOut:    function (cmd, response){
        adapter.log.info('tempOut - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('tempOut', +parseFloat(response.readFloatLE(6)).toFixed(4));
    },
    tempDiff:   function (cmd, response){
        adapter.log.info('tempDiff - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('tempDiff', +parseFloat(response.readFloatLE(6)).toFixed(4));
    },
    power:      function (cmd, response){
        adapter.log.info('power - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('power', +parseFloat(response.readFloatLE(6)).toFixed(4));
    },
    volume:     function (cmd, response){
        adapter.log.info('volume - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('volume', +parseFloat(response.readFloatLE(6)).toFixed(4));
    },
    rate:     function (cmd, response){
        adapter.log.info('rate - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('rate', +parseFloat(response.readFloatLE(6)).toFixed(4));
    },
    imp1:     function (cmd, response){
        adapter.log.info('imp1 - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('imp1', response.readFloatLE(6));
    },
    imp2:     function (cmd, response){
        adapter.log.info('imp2 - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('imp2', response.readFloatLE(6));
    },
    imp3:     function (cmd, response){
        adapter.log.info('imp3 - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('imp3', response.readFloatLE(6));
    },
    imp4:     function (cmd, response){
        adapter.log.info('imp4 - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('imp4', response.readFloatLE(6));
    },
    rateEn:     function (cmd, response){
        adapter.log.info('rateEn - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('rateEn', +parseFloat(response.readFloatLE(6)).toFixed(4));
    },
    timeWork:     function (cmd, response){
        adapter.log.info('timeWork - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('timeWork', response.readFloatLE(6));
    },
    sysTime:     function (cmd, response){
        adapter.log.info('sysTime - ' + ' response: ' + JSON.stringify(response) + ' length: ' + response.length);
        setStates('sysTime', concatZero(response[7]) + '.' + concatZero(response[8]) + (response[6] + 2000) + ' ' + concatZero(response[9]) + ':' + concatZero(response[10]) + ':' + concatZero(response[11]));
    }
};

function poll(){
    const len = [10 + options.read[iter].cmd.length];
    cmd = [].concat(addr, options.read[iter].code, len, options.read[iter].cmd, [0x78, 0x78]);
    //adapter.log.info('cmd = ' + cmd);
    send(cmd, (response) => {
        adapter.log.info(response.length > 0 ? 'Ответ получен, парсим:' :'Нет ответа на команду, читаем следующую.');
        if (response.length > 0) options.read[iter].func(cmd, response);
        response = null;
        iter++;
        if (iter > options.read.length - 1){
            iter = 0;
            adapter.log.info('Все данные прочитали');
            timeoutPoll = setTimeout(() => {
                if (sanext) sanext._events.data = undefined;
                poll();
            }, pollingInterval);
        } else {
            poll();
        }
    });
}

const options = {
    read: [
        {code: 0x01, cmd: [0x40, 0x00, 0x00, 0x00], desc: 'Чтение энергии', func: func.readEnergy},
        {code: 0x01, cmd: [0x04, 0x00, 0x00, 0x00], desc: 'Чтение температуры подачи', func: func.tempIn},
        {code: 0x01, cmd: [0x08, 0x00, 0x00, 0x00], desc: 'Чтение температуры обратки', func: func.tempOut},
        {code: 0x01, cmd: [0x10, 0x00, 0x00, 0x00], desc: 'Чтение разницы температур', func: func.tempDiff},
        {code: 0x01, cmd: [0x20, 0x00, 0x00, 0x00], desc: 'Чтение мощности', func: func.power},
        {code: 0x01, cmd: [0x80, 0x00, 0x00, 0x00], desc: 'Чтение объема', func: func.volume},
        {code: 0x01, cmd: [0x00, 0x01, 0x00, 0x00], desc: 'Чтение расхода', func: func.rate},
        {code: 0x01, cmd: [0x00, 0x02, 0x00, 0x00], desc: 'Чтение имп вход 1', func: func.imp1},
        {code: 0x01, cmd: [0x00, 0x04, 0x00, 0x00], desc: 'Чтение имп вход 2', func: func.imp2},
        {code: 0x01, cmd: [0x00, 0x08, 0x00, 0x00], desc: 'Чтение имп вход 3', func: func.imp3},
        {code: 0x01, cmd: [0x00, 0x10, 0x00, 0x00], desc: 'Чтение имп вход 4', func: func.imp4},
        {code: 0x01, cmd: [0x00, 0x20, 0x00, 0x00], desc: 'Чтение расход (по энергии)', func: func.rateEn},
        {code: 0x01, cmd: [0x00, 0x00, 0x08, 0x00], desc: 'Чтение Время нормальной работы', func: func.timeWork},
        {code: 0x04, cmd: [], desc: 'Чтение системного времени прибора', func: func.sysTime}
    ]
};

function send(cmd, cb){
    adapter.log.info('------------------------------------------------------------------------------------------------------');
    sanext.once('data', (response) => {
        adapter.log.info('RESPONSE: ' + JSON.stringify(response));
        cb && cb(response);
    });
    const b1 = ((crc(cmd) >> 8) & 0xff);
    cmd[cmd.length] = (crc(cmd) & 0xff);
    cmd[cmd.length] = b1;
    const buf = Buffer.from(cmd);
    setTimeout(() => {
        adapter.log.info('Send cmd - [' + toHexString(buf) + ']');
        adapter.log.info('CMD - ' + JSON.stringify(buf));
        sanext.write(buf);
    }, 500);
}

function toHexString(byteArray){
    return Array.from(byteArray, (byte) => {
        return ('0' + (byte).toString(16)).slice(-2).toUpperCase();
    }).join(' ');
}

function setStates(name, val){
    adapter.getState(name, function (err, state){
        if (!state){
            adapter.setState(name, {val: val, ack: true});
        } else if (state.val === val){
            adapter.log.debug('setState ' + name + ' { oldVal: ' + state.val + ' = newVal: ' + val + ' }');
        } else if (state.val !== val){
            adapter.setState(name, {val: val, ack: true});
            adapter.log.debug('setState ' + name + ' { oldVal: ' + state.val + ' != newVal: ' + val + ' }');
        }
    });
}

function main(){
    if (!adapter.systemConfig) return;
    adapter.subscribeStates('*');
    pollingInterval = adapter.config.pollingtime ? adapter.config.pollingtime :5000;
    connectTCP();
}

function connectTCP(){
    adapter.log.debug('Connect to ' + adapter.config.ip + ':' + adapter.config.port);
    sanext = new net.Socket();
    sanext.connect({host: adapter.config.ip, port: adapter.config.port}, () => {
        adapter.log.info('Connected to server ' + adapter.config.ip + ':' + adapter.config.port);
        adapter.setState('info.connection', true, true);
        pollAllowed = true;
        isOnline = true;
        poll();
    });
    sanext.on('close', (e) => {
        adapter.log.debug('closed ' + JSON.stringify(e));
        //reconnect();
    });
    sanext.on('error', (e) => {
        adapter.log.error('sanext ERROR: ' + JSON.stringify(e));
        if (e.code === 'EISCONN' || e.code === 'EPIPE' || e.code === 'EALREADY' || e.code === 'EINVAL' || e.code === 'ECONNRESET' || e.code === 'ENOTFOUND') reconnect();
    });
    sanext.on('end', () => {
        adapter.log.debug('Disconnected from server');
        reconnect();
    });
}

function reconnect(){
    pollAllowed = false;
    isOnline = false;
    adapter.setState('info.connection', false, true);
    adapter.log.debug('Sanext reconnect after 10 seconds');
    reconnectTimeOut = setTimeout(() => {
        if (sanext) sanext._events.data = undefined;
        connectTCP();
    }, 10000);
}

function concatZero(s){
    return s < 10 ? '0' + s: s;
}

const crc = function (buffer){
    let crc = 0xFFFF, odd;
    for (let i = 0; i < buffer.length; i++) {
        crc = crc ^ buffer[i];
        for (let j = 0; j < 8; j++) {
            odd = crc & 0x0001;
            crc = crc >> 1;
            if (odd){
                crc = crc ^ 0xA001;
            }
        }
    }
    return crc;
};

if (module.parent){
    module.exports = startAdapter;
} else {
    startAdapter();
}
