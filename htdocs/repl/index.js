function calculate_size() {
    let cols = Math.max(80, Math.min(150, ($( window ).width() - 260) / 8)) | 0;
    let rows = Math.max(24, Math.min(80, ($( window ).height() - 150) / 19)) | 0;
    return [cols, rows];
}

function to_uint8array(string, debug = false) {
    if (debug) { console.log("to_uint8array", string); }
    return _.map(string, function (char, index) { return char.charCodeAt(0); });
}

function from_uint8array(array, debug = false) {
    if (debug) { console.log("from_uint8array", string); }
    return _.map(array, function (value, index) { return String.fromCharCode(value); }).join("");
}

toastr.options = {
    "closeButton": false,
    "debug": false,
    "newestOnTop": false,
    "progressBar": true,
    "positionClass": "toast-top-right",
    "preventDuplicates": true,
    "onclick": null,
    "showDuration": "300",
    "hideDuration": "1000",
    "timeOut": "5000",
    "extendedTimeOut": "3000",
    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut"
};

/* @@@@@@@@@@@@@@@@@@@@@@@@ Bluetooth Web API @@@@@@@@@@@@@@@@@@@@@@@@ */
const nus_primary_service_uuid = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const nus_rx_characteristic_uuid = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const nus_tx_characteristic_uuid = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

$('#service').val(nus_primary_service_uuid);

var bluetooth_device = null;
var nus_rx_characteristic = null;
var nus_tx_characteristic = null;
var bluetooth_object = { status: "Connect", time: new Date(), notifications: 0 };
var bluetooth_object_observable = Observable.from(bluetooth_object);
bluetooth_object_observable.observe(function (changes) {
    changes.forEach(change => {
        if (change.path[0] == "status") {
            if (change.value != "Connect" && change.value != "Disconnect") {
                toastr.info(change.value);
            }
            if (change.value == "Connect") {
                $('#connection').text(change.value);
                $("#connection").removeClass("btn-success").addClass("btn-danger");
                $("#connections_time").text("Disconnected");
            } else if (change.value == "Disconnect") {
                $('#connection').text(change.value);
                $("#connection").removeClass("btn-danger").addClass("btn-success");
            }
        } else if (change.path[0] == "notifications") {
            if (bluetooth_object_observable.notifications == 1 && change.oldValue == 0) {
                bluetooth_object_observable.status = "Disconnect";
                bluetooth_object_observable.time = new Date();
                toastr.success('Bluetooth Device connected');
                console.log('Bluetooth Device connected');
                enable_terminal();
                write_to_bluetooth(to_uint8array(from_uint8array([2])));
            } else if (bluetooth_object_observable.notifications == 0 && change.oldValue == 1) {
                toastr.warning('Bluetooth Device disconnected');
                console.log('Bluetooth Device disconnected');
                disable_terminal();
            }
        }
    });
});

$('#connection').click(function () {
    let text = $('#connection').text();
    if (text == "Connect") {
        bluetooth_connection();
    } else if (text == "Disconnect") {
        bluetooth_disconnection();
    }
});

var timer = moment.duration(1, "seconds").timer({ loop: true }, function () {
    if (bluetooth_object_observable.status == "Disconnect") {
        var elapsed = moment().from(bluetooth_object_observable.time, true);
        $("#connections_time").text("Connected from " + elapsed);
    }
});

function bluetooth_connection() {
    if (!navigator.bluetooth) {
        console.log('WebBluetooth API is not available. Please make sure the Web Bluetooth flag is enabled');
        toastr.error('WebBluetooth API is not available. Please make sure the Web Bluetooth flag is enabled');
        return;
    }
    let filters = [];
    let filterService = $('#service').val();
    if (filterService) {
        filters.push({ services: [filterService] });
    }
    let filterName = $('#name').val();
    if (filterName) {
        filters.push({ name: filterName });
    }
    let options = {};
    if ($('#all_devices').prop('checked')) {
        options.acceptAllDevices = true;
    } else {
        options.filters = filters;
    }
    console.log('Requesting Bluetooth Device with ', JSON.stringify(options));
    navigator.bluetooth.requestDevice(options)
        .then(device => {
            bluetooth_object_observable.status = "Connecting";
            console.log(bluetooth_object_observable.status, device.name);
            bluetooth_object_observable.notifications = 0;
            bluetooth_device = device;
            bluetooth_device.addEventListener('gattserverdisconnected', on_disconnected);
            return device.gatt.connect();
        })
        .then(server => {
            bluetooth_object_observable.status = "Getting Services";
            console.log(bluetooth_object_observable.status);
            return server.getPrimaryService(nus_primary_service_uuid);
        }).then(service => {
            let queue = Promise.resolve();
            queue = queue.then(_ => service.getCharacteristics().then(characteristics => {
                bluetooth_object_observable.status = 'Service: ' + service.uuid;
                console.log(bluetooth_object_observable.status);
                bluetooth_object_observable.status = "Getting Characteristics";
                console.log(bluetooth_object_observable.status);
                characteristics.forEach(characteristic => {
                    bluetooth_object_observable.status = 'Characteristic: ' + characteristic.uuid;
                    console.log(bluetooth_object_observable.status);
                    if (characteristic.uuid == nus_rx_characteristic_uuid) {
                        nus_rx_characteristic = characteristic;
                    } else if (characteristic.uuid == nus_tx_characteristic_uuid) {
                        nus_tx_characteristic = characteristic;
                        nus_tx_characteristic.startNotifications().then(_ => {
                            bluetooth_object_observable.status = 'Notification Enables for Characteristic: ' + characteristic.uuid;
                            console.log(bluetooth_object_observable.status);
                            nus_tx_characteristic.addEventListener('characteristicvaluechanged', nus_tx_handle_notifications);
                            bluetooth_object_observable.notifications++;
                        });
                    }
                });
            }));
            return queue;
        }).catch(error => {
            bluetooth_object_observable.status = "Connect";
            bluetooth_object_observable.notifications = 0;
            toastr.error('Argh! ' + error);
            console.log('Argh! ' + error);
        });
}

function on_disconnected(event) {
    bluetooth_object_observable.status = "Connect";
    bluetooth_object_observable.notifications = 0;
}

function bluetooth_disconnection() {
    if (!bluetooth_device) {
        return;
    }
    if (bluetooth_device.gatt.connected) {
        bluetooth_object_observable.status = "Disconnecting";
        bluetooth_device.gatt.disconnect();
    }
    bluetooth_object_observable.status = "Connect";
    bluetooth_object_observable.notifications = 0;
}

function write_to_bluetooth(array) {
    nus_rx_characteristic.writeValue(array);
}

function is_connected_to_bluetooth() {
    if (!bluetooth_device) {
        return false;
    }
    if (bluetooth_device.gatt.connected) {
        return true;
    }
}

function nus_tx_handle_notifications(event) {
    let value = event.target.value;
    let line = from_uint8array(new Uint8Array(value.buffer));
    write_terminal(line);
}
/* @@@@@@@@@@@@@@@@@@@@@@@@ Bluetooth Web API @@@@@@@@@@@@@@@@@@@@@@@@ */

/* @@@@@@@@@@@@@@@@@@@@@@@@ xterm.js @@@@@@@@@@@@@@@@@@@@@@@@ */
var [cols, rows] = calculate_size();
var term = new Terminal({
    cols: cols,
    rows: rows,
    useStyle: true,
    screenKeys: true,
    cursorBlink: false
});
term.open(document.getElementById('terminal'), focus = false);
term.on('data', function (key) {
    if(is_connected_to_bluetooth()) {
        write_to_bluetooth(to_uint8array(key));
    } else {
        toastr.error('Bluetooth Device disconnected');
    }
});
disable_terminal()

function write_terminal(string) {
    term.write(string);
}

function disable_terminal() {
    term.reset();
    term.blur();
}

function enable_terminal() {
    term.focus();
}

function resize_terminal(cols, rows) {
    term.resize(cols, rows);
}

$( window ).resize(function() {
    var [cols, rows] = calculate_size();
    resize_terminal(cols, rows);
});
/* @@@@@@@@@@@@@@@@@@@@@@@@ xterm.js @@@@@@@@@@@@@@@@@@@@@@@@ */