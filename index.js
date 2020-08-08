#!/usr/bin/nodejs

// -------------- load packages -------------- //
var express = require('express');
var app = express();
var hbs = require('hbs');
var path = require('path');
var fs = require('fs');

var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var mysql = require('mysql');

// -------------- express initialization -------------- //
app.set('port', process.env.PORT || 8080);
app.set('view engine', 'hbs');

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// -------------- globals -------------- //
var user_list = [];
var draftHistory = [];
var teams = {};
var curr_user_pointer = 1;
var draft_started = false;

var timer;

var player_sheet = [];
var draft_order = [];
var positions = [
    {'name': 'QB', 'color': '#f9cb9c'},
    {'name': 'RB1', 'color': '#c9daf8'},
    {'name': 'RB2', 'color': '#c9daf8'},
    {'name': 'WR1', 'color': '#d9ead3'},
    {'name': 'WR2', 'color': '#d9ead3'},
    {'name': 'TE', 'color': '#d9d2e9'},
    {'name': 'FLX', 'color': '#f4cccc'},
    {'name': 'D/ST', 'color': '#d0e0e3'},
    {'name': 'K', 'color': '#ffe599'},
];

// Populate positions with bench objects
for(var k = 0; k < 7; k++){
    positions.push({'name': 'BE', 'color': '#efefef', 'id': k+9});
}

// Read in the player file and populate the player_sheet
fs.readFile('./player_data.txt', 'utf8', function(err, data){
    init_array = data.split("\n");
    for(var i = 0; i < init_array.length; i++){
        info_array = init_array[i].split(",");
        info_obj = {
            'name': info_array[0],
            'team': info_array[1],
            'pos': info_array[2],
            'games': info_array[4],
            'avg': info_array[5],
            'bye': info_array[3],
        };
        player_sheet.push(info_obj);
    }
});

// Read in the draft order
//++++++++++++++++++++ Change the draft order file ++++++++++++++++++++//
fs.readFile('./draft_order.txt', 'utf8', function(err, data){
    pickList = data.split(',');
    for(i = 0; i < pickList.length; i++){
        if(pickList[i][0] === 'R'){
            draft_order.push({'value': pickList[i], 'rnd': true});
        }
        else{
            info = pickList[i].split('-');
            draft_order.push({'value': info[1], 'rnd': false, 'num': info[0]});
        }
    }
});

//++++++++++++++++++++ Change the number of users ++++++++++++++++++++//
const NUM_USERS = 12;
//++++++++++++++++++++ If time is changed, change time in fantasy.js ++++++++++++++++++++//
const ALLOWED_DRAFT_TIME = 45;

// -------------- database connection -------------- //
const db = mysql.createConnection({
    host: 'mysql1.csl.tjhsst.edu',
    user: 'site_fantasy',
    password: 'hwQj4Ux3bj9LqZubddAQwKcC',
    database: 'site_fantasy',
});

db.connect(function(err){
    if(err) throw err;
    console.log('MySQL Connected...');
});

// -------------- express endpoints -------------- //
app.get('/', function(req, res){
    res.render('index.hbs', {'info': player_sheet, 'positions': positions, 'draft_order': draft_order, 'history': draftHistory});
});

app.get('/favicon.ico', function(req, res){
    res.sendFile(path.join(__dirname, 'football.ico'));
});

// -------------- socket connections -------------- //
io.on('connection', function(server_socket){
    // Removes drafted player from player sheet and sends index so client's can remove
    server_socket.on('client_draft_index', function(client_obj){
        
        // The user has made a choice, so stop server side timer
        clearTimeout(timer);
        
        // Client indexes players from 1, so do -1 to adjust
        player_sheet.splice(client_obj.index-1, 1);
        io.emit('server_draft_index', {'index': client_obj.index});
    });
    
    // Adds drafted player's info into the relevant user's table
    server_socket.on('client_draft_player', function(client_obj){
        data = {id: client_obj.row, player: client_obj.player};
        sql = `INSERT INTO ${client_obj.username} SET ?`;
        db.query(sql, data, function(err, result){
            if(err) throw err;
            console.log(`${client_obj.player} added to table ${client_obj.username} on row ${client_obj.row}`);
            
            teams[client_obj.username].push([client_obj.player, client_obj.bye, client_obj.row]);
            draftHistory.unshift({'pick': `${client_obj.username} drafted ${client_obj.player}`});
        
            // Increment the user pointer
            prev = curr_user_pointer;
            curr_user_pointer++;
            if(curr_user_pointer >= draft_order.length) {
                io.emit('server_draft_player', {
                    'username': client_obj.username, 
                    'player': client_obj.player,
                    'next_user': 'aw8o3u2oq3j2',
                    'prev_index': prev,
                    'next_index': curr_user_pointer
                });
                console.log('Draft is over! Here are the teams: ');
                console.log(teams);
            }
            else{
                if(draft_order[curr_user_pointer].rnd) {curr_user_pointer++;}
                
                io.emit('server_draft_player', {
                    'username': client_obj.username, 
                    'player': client_obj.player,
                    'next_user': draft_order[curr_user_pointer].value,
                    'prev_index': prev,
                    'next_index': curr_user_pointer
                });
                
                startTimer();
            }
        });
    });
    
    // Creates table for a new user and adds them to the user list
    server_socket.on('client_new_user', function(client_obj){
        if(!draft_started){
            sql = `CREATE TABLE ${client_obj.name} (id INT, player VARCHAR(255))`;
            db.query(sql, function(err, result){
                if(err) throw err;
                
                user_list.push(client_obj.name);
                teams[client_obj.name] = [];
                console.log(client_obj.name + ' just joined! This is the user list: ', user_list);
                console.log(`Table ${client_obj.name} created...`);
                
                if(user_list.length >= NUM_USERS){
                    console.log('Draft started!');
                    console.log('User list: ', user_list);
                    console.log('#############################');
                    draft_started = true;
                    io.emit('server_start', {
                        'username': draft_order[curr_user_pointer].value,
                        'next_index': curr_user_pointer,
                        'prev_index': 0
                    });
                    startTimer();
                }
            });
        }
    });
    
    // Process valid trade requests or returns a fail message if trade is invalid
    server_socket.on('client_trade_request', function(client_obj){
        console.log(client_obj);
        
        flag = true;
        
        if(!client_obj.user1 || !client_obj.user2 || !user_list.includes(client_obj.user1) || !user_list.includes(client_obj.user2)){
            console.log('invalid names');
            flag = false;
        }
        else{
            for(i=0; i < client_obj.user1picks.length; i++){
                if(client_obj.user1picks[i] !== 0 && convert(client_obj.user1picks[i]) <= curr_user_pointer){
                    console.log('invalid user1 picks');
                    flag = false;
                }
                else if(client_obj.user2picks[i] !== 0 && convert(client_obj.user2picks[i]) <= curr_user_pointer){
                    console.log('invalid user2 picks');
                    flag = false;
                }
            }
        }
        
        if(flag){
            for(i=0; i < client_obj.user1picks.length; i++){
                if(client_obj.user1picks[i] !== 0){
                    draft_order[convert(client_obj.user1picks[i])].value = client_obj.user1;
                }
                if(client_obj.user2picks[i] !== 0){
                    draft_order[convert(client_obj.user2picks[i])].value = client_obj.user2;
                }
            }
            io.emit('server_trade', {
                'success': true, 
                'messg': 'Trade successful!',
                'user1': client_obj.user1,
                'user2': client_obj.user2,
                'user1picks': client_obj.user1picks,
                'user2picks': client_obj.user2picks,
                'base': NUM_USERS
            });
        }
        
        else{
            io.emit('server_trade', {'success': false, 'messg': 'Failed to process trade...'});
        }
    });
    
    server_socket.on('client_returning_user', function(client_obj){
       io.emit('server_returning_user', {
           'name': client_obj.name,
           'info': teams[client_obj.name]
       }); 
    });
});

function startTimer(){
    timer = setTimeout(function(){
        // If the user doesn't draft after the given time...
        autodraft();
        
    }, (ALLOWED_DRAFT_TIME+1)*1000);
}

function autodraft(){
    clearTimeout(timer);

    auto_select = player_sheet.shift();

    index = calcIndex([auto_select.name, auto_select.bye, auto_select.pos, draft_order[curr_user_pointer].value]);
    teams[draft_order[curr_user_pointer].value].push([auto_select.name, auto_select.bye, index]);
    draftHistory.unshift({'pick': `${draft_order[curr_user_pointer].value} drafted ${auto_select.name}`});
    io.emit('server_draft_index', {'index': 1});
    
    
    data = {id: index, player: auto_select.name};
    sql = `INSERT INTO ${draft_order[curr_user_pointer].value} SET ?`;
    db.query(sql, data, function(err, result){
        if(err) throw err;
        console.log(`${auto_select.name} added to table ${draft_order[curr_user_pointer].value} on row ${index}`);
    
        prev = curr_user_pointer;
        curr_user_pointer++;
        if(curr_user_pointer >= draft_order.length) {
            io.emit('server_autopick', {
                'username': draft_order[prev].value, 
                'player': auto_select.name,
                'next_user': 'aw8o3u2oq3j2',
                'prev_index': prev,
                'next_index': curr_user_pointer,
                'info': [auto_select.name, auto_select.bye, auto_select.pos]
            });
            console.log('Draft is over! Here are the teams: ');
            console.log(teams);
        }
        else{
            if(draft_order[curr_user_pointer].rnd) {curr_user_pointer++;}
            
            io.emit('server_autopick', {
                'username': draft_order[prev].value, 
                'player': auto_select.name,
                'next_user': draft_order[curr_user_pointer].value,
                'prev_index': prev,
                'next_index': curr_user_pointer,
                'info': [auto_select.name, auto_select.bye, auto_select.pos]
            });
            
            startTimer();
    
        }
    });        
}

function convert(num){
    return Math.floor((num-1)/NUM_USERS) + num;
}

function calcIndex(data){
    pos_to_id = {
        'QB': [1, 10, 11, 12, 13, 14, 15, 16],
        'RB': [2, 3, 7, 10, 11, 12, 13, 14, 15, 16],
        'WR': [4, 5, 7, 10, 11, 12, 13, 14, 15, 16],
        'TE': [6, 7, 10, 11, 12, 13, 14, 15, 16],
        'D/ST': [8, 10, 11, 12, 13, 14, 15, 16],
        'K': [9, 10, 11, 12, 13, 14, 15, 16]
    };
    
    possible_slots = pos_to_id[data[2]];
    filled = teams[data[3]].map(function(elem){
        return elem[2];
    });
    
    for(k=0; k < possible_slots.length; k++){
        if(!filled.includes(possible_slots[k])){
            return possible_slots[k];
        }
    } 
    return 17;
}

// -------------- listener -------------- //
var listener = server.listen(process.env.PORT, function(){
    console.log('--------------------------------------------');
    console.log(Date());
    console.log('Express server started on port: ' + listener.address().port);
});
