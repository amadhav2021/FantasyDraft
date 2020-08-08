var client_socket = io.connect('https://fantasy.sites.tjhsst.edu/', {path: '/socket.io/'});
var timer;

if(localStorage.getItem('name') !== null){
    document.querySelector('.bg-modal').style.display = 'none';
    headerList = document.getElementById('myTable').getElementsByTagName('th');
    for(i=0; i<headerList.length; i++){
        headerList[i].style.position = 'sticky';
    }
    client_socket.emit('client_returning_user', {'name': localStorage.getItem('name')});
}

client_socket.on('server_draft_index', function(server_event_msg){
    document.getElementById("myTable").deleteRow(server_event_msg.index);
});

client_socket.on('server_draft_player', function(server_event_msg){
    change_player_turn(server_event_msg.next_user, server_event_msg.prev_index, server_event_msg.next_index);
    addToHistory(server_event_msg.username, server_event_msg.player);
});

client_socket.on('server_autopick', function(server_event_msg){
    if(server_event_msg.username === localStorage.getItem('name')){
        clearInterval(timer);
        insertToPlayerTable(server_event_msg.info);
    }
    change_player_turn(server_event_msg.next_user, server_event_msg.prev_index, server_event_msg.next_index);
    addToHistory(server_event_msg.username, server_event_msg.player);
});

client_socket.on('server_start', function(server_event_msg){
    change_player_turn(server_event_msg.username, server_event_msg.prev_index, server_event_msg.next_index);
});

client_socket.on('server_trade', function(server_event_msg){
    order = document.getElementById('picksList').getElementsByTagName("a");
    if(server_event_msg.success){
        for(i=0; i < server_event_msg.user1picks.length; i++){
            if(server_event_msg.user1picks[i] !== 0){
                order[convert(server_event_msg.user1picks[i], server_event_msg.base)].innerHTML = 'Pick ' + server_event_msg.user1picks[i] + ': ' + server_event_msg.user1;
            }
            if(server_event_msg.user2picks[i] !== 0){
                order[convert(server_event_msg.user2picks[i], server_event_msg.base)].innerHTML = 'Pick ' + server_event_msg.user2picks[i] + ': ' + server_event_msg.user2;
            }
        }
        
        input_fields = document.getElementById('tradeBlock').getElementsByTagName("input");
        for(k=0; k<input_fields.length; k++){
            input_fields[k].value = '';
        }
    }
    if(localStorage.getItem('name') === 'Amish'){
        alert(server_event_msg.messg);
    }
});

client_socket.on('server_returning_user', function(server_event_msg){
   if(localStorage.getItem('name') === server_event_msg.name && server_event_msg.info !== undefined){
       server_event_msg.info.forEach(insertToPlayerTableWithRow);
   } 
});

function usernameSubmit(){
    username = document.querySelector("input[name='userList']:checked").value;
    localStorage.setItem('name', username);
    document.querySelector('.bg-modal').style.display = 'none';
    headerList = document.getElementById('myTable').getElementsByTagName('th');
    for(i=0; i<headerList.length; i++){
        headerList[i].style.position = 'sticky';
    }
    client_socket.emit('client_new_user', {'name': username});
}

function search() {
    var input, filter, table, tr, td, i, txtValue;
    input = document.getElementById("myInput");
    filter = input.value.toUpperCase();
    table = document.getElementById("myTable");
    tr = table.getElementsByTagName("tr");
    for (i = 0; i < tr.length; i++) {
        td = tr[i].getElementsByTagName("td")[0];
        if (td) {
          txtValue = td.textContent || td.innerText;
          if (txtValue.toUpperCase().indexOf(filter) > -1) {
            tr[i].style.display = "";
          } else {
            tr[i].style.display = "none";
          }
        }       
    }
}

function draft(elem){
    lock();
    clearInterval(timer);
    var data = elem.id.split(",");
    var row = insertToPlayerTable(data);
    
    var index = elem.parentNode.parentNode.rowIndex;
    client_socket.emit('client_draft_index', {'index': index});
    client_socket.emit('client_draft_player', {
        'username': localStorage.getItem('name'), 
        'player': data[0],
        'row': row,
        'bye': data[1]
    });
}

function insertToPlayerTable(data){
    pos_to_id = {
        'QB': [1, 10, 11, 12, 13, 14, 15, 16],
        'RB': [2, 3, 7, 10, 11, 12, 13, 14, 15, 16],
        'WR': [4, 5, 7, 10, 11, 12, 13, 14, 15, 16],
        'TE': [6, 7, 10, 11, 12, 13, 14, 15, 16],
        'D/ST': [8, 10, 11, 12, 13, 14, 15, 16],
        'K': [9, 10, 11, 12, 13, 14, 15, 16]
    };
    
    possible_slots = pos_to_id[data[2]];
    for(k=0; k < possible_slots.length; k++){
        curr_row = document.getElementById('myTeam').rows[possible_slots[k]].cells;
        if(curr_row[1].textContent == '---'){
            curr_row[1].innerHTML = data[0];
            curr_row[2].innerHTML = data[1];
            return possible_slots[k];
        }
    } 
    return 17;
}

function insertToPlayerTableWithRow(data){
    if(data[2] >= 1 && data[2] <= 16){
        curr_row = document.getElementById('myTeam').rows[data[2]].cells;
        curr_row[1].innerHTML = data[0];
        curr_row[2].innerHTML = data[1];
    }
}

function change_player_turn(user, prev, next){
    if(user === localStorage.getItem('name')){
        table = document.getElementById('myTable');
        table_rows = table.getElementsByTagName('tr');
        for(i = 1; i < table_rows.length; i++){
            row_data = table_rows[i].getElementsByTagName("td");
            btn = row_data[row_data.length-1].getElementsByTagName("button")[0];
            btn.classList.add("hover");
            btn.innerHTML = 'Draft';
            btn.disabled = false;
        }
        startTimer();
    }
    
    else{
        lock();
    }
    
    picks = document.getElementById('picksList').getElementsByTagName("a");
    if(prev > 0){
        picks[prev].style.backgroundColor = 'white';
    }
    if(next < picks.length){
        picks[next].style.backgroundColor = '#AAF0D1';
    }
    else{
        alert('End of the draft!');
    }
}

function startTimer(){
    time = 45;
    element = document.getElementById("timer");
    function decrease(elem){
        time--;
        if(time >= 0){
            formatted_time = `0:${time}`;
            if(time < 10){
                formatted_time = `0:0${time}`;  
            }
            elem.innerHTML = formatted_time;
        }
        if(time <= 0){
            clearInterval(timer);
            lock();
        }
    }
    timer = setInterval(decrease, 1000, element);
}

function tradeRequest(){
    if(Number(document.getElementById('pass').value) === 100){
        client_socket.emit('client_trade_request', {
            'user1': document.getElementById('user1').value,
            'user1picks': [Number(document.getElementById('1user1').value), Number(document.getElementById('2user1').value), Number(document.getElementById('3user1').value)],
            'user2': document.getElementById('user2').value,
            'user2picks': [Number(document.getElementById('1user2').value), Number(document.getElementById('2user2').value), Number(document.getElementById('3user2').value)]
        });
    }
    else{
        alert('Incorrect password!');
    }
}

function convert(num, base){
    return Math.floor((num-1)/base) + num;
}

function lock(){
    document.getElementById('timer').innerHTML = '-----';
    table = document.getElementById('myTable');
    table_rows = table.getElementsByTagName('tr');
    for(i = 1; i < table_rows.length; i++){
        row_data = table_rows[i].getElementsByTagName("td");
        btn = row_data[row_data.length-1].getElementsByTagName("button")[0];
        btn.classList.remove("hover");
        btn.innerHTML = "<img src='https://cdn3.iconfinder.com/data/icons/web-and-internet-icons/512/Lock-512.png' width='20', height='20'>";
        btn.disabled = true;
    }
}

function openHistory(){
    document.querySelector('.draftmodal-bg').style.display = 'flex';
    headerList = document.getElementById('myTable').getElementsByTagName('th');
    for(i=0; i<headerList.length; i++){
        headerList[i].style.position = 'static';
    }
}

function closeHistory(){
    document.querySelector('.draftmodal-bg').style.display = 'none';
    headerList = document.getElementById('myTable').getElementsByTagName('th');
    for(i=0; i<headerList.length; i++){
        headerList[i].style.position = 'sticky';
    }
}

function addToHistory(user, player){
    ul = document.querySelector('#drafthistory');
    latest = document.createElement('li');
    latest.innerHTML = `<span style='color: black;'>${user} drafted ${player}</span>`;
    ul.insertBefore(latest, ul.firstChild);
}