// Thirty famous duels, shown behind the starting page: every one a game between
// two players. Each is its moves as far as the celebrated one, which is last: the
// board is set up just before it, and then it is played. The tests play every
// one of these through the rules engine.

export const MOMENTS = [
  {
    title: 'The Immortal Game',
    who: 'Anderssen – Kieseritzky, London 1851',
    note: 'Both rooks and the queen are gone, and the bishop gives mate, as the ending is usually told.',
    moves: 'e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#',
  },
  {
    title: 'The Evergreen Game',
    who: 'Anderssen – Dufresne, Berlin 1852',
    note: 'The end of one of the most admired attacks of the century.',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#',
  },
  {
    title: 'The Game of the Century',
    who: 'D. Byrne – Fischer, New York 1956',
    note: 'A thirteen-year-old leaves his queen to be taken.',
    moves: 'Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5 Qb3 dxc4 Qxc4 c6 e4 Nbd7 Rd1 Nb6 Qc5 Bg4 Bg5 Na4 Qa3 Nxc3 bxc3 Nxe4 Bxe7 Qb6 Bc4 Nxc3 Bc5 Rfe8+ Kf1 Be6',
  },
  {
    title: 'Kasparov\'s Immortal',
    who: 'Kasparov – Topalov, Wijk aan Zee 1999',
    note: 'A rook sacrifice that sends the black king across the board.',
    moves: 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Nge2 Nbd7 Bh6 Bxh6 Qxh6 Bb7 a3 e5 O-O-O Qe7 Kb1 a6 Nc1 O-O-O Nb3 exd4 Rxd4 c5 Rd1 Nb6 g3 Kb8 Na5 Ba8 Bh3 d5 Qf4+ Ka7 Rhe1 d4 Nd5 Nbxd5 exd5 Qd6 Rxd4',
  },
  {
    title: 'The shower of gold coins',
    who: 'Levitsky – Marshall, Breslau 1912',
    note: 'The queen steps where three enemy pieces could take her.',
    moves: 'd4 e6 e4 d5 Nc3 c5 Nf3 Nc6 exd5 exd5 Be2 Nf6 O-O Be7 Bg5 O-O dxc5 Be6 Nd4 Bxc5 Nxe6 fxe6 Bg4 Qd6 Bh3 Rae8 Qd2 Bb4 Bxf6 Rxf6 Rad1 Qc5 Qe2 Bxc3 bxc3 Qxc3 Rxd5 Nd4 Qh5 Ref8 Re5 Rh6 Qg5 Rxh3 Rc5 Qg3',
  },
  {
    title: 'Rubinstein\'s immortal',
    who: 'Rotlewi – Rubinstein, Łódź 1907',
    note: 'The last blow of a famous run of sacrifices.',
    moves: 'd4 d5 Nf3 e6 e3 c5 c4 Nc6 Nc3 Nf6 dxc5 Bxc5 a3 a6 b4 Bd6 Bb2 O-O Qd2 Qe7 Bd3 dxc4 Bxc4 b5 Bd3 Rd8 Qe2 Bb7 O-O Ne5 Nxe5 Bxe5 f4 Bc7 e4 Rac8 e5 Bb6+ Kh1 Ng4 Be4 Qh4 g3 Rxc3 gxh4 Rd2 Qxd2 Bxe4+ Qg2 Rh3',
  },
  {
    title: 'Reykjavík, game six',
    who: 'Fischer – Spassky, World Championship 1972',
    note: 'The rook breaks in. Spassky joined the applause for this game.',
    moves: 'c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6 dxc5 bxc5 O-O Ra7 Be2 Nd7 Nd4 Qf8 Nxe6 fxe6 e4 d4 f4 Qe7 e5 Rb8 Bc4 Kh8 Qh3 Nf8 b3 a5 f5 exf5 Rxf5 Nh7 Rcf1 Qd8 Qg3 Re7 h4 Rbb7 e6 Rbc7 Qe5 Qe8 a4 Qd8 R1f2 Qe8 R2f3 Qd8 Bd3 Qe8 Qe4 Nf6 Rxf6',
  },
  {
    title: 'Resignation in a winning light',
    who: 'R. Byrne – Fischer, US Championship 1963',
    note: 'After this quiet queen move, White gave up.',
    moves: 'd4 Nf6 c4 g6 g3 c6 Bg2 d5 cxd5 cxd5 Nc3 Bg7 e3 O-O Nge2 Nc6 O-O b6 b3 Ba6 Ba3 Re8 Qd2 e5 dxe5 Nxe5 Rfd1 Nd3 Qc2 Nxf2 Kxf2 Ng4+ Kg1 Nxe3 Qd2 Nxg2 Kxg2 d4 Nxd4 Bb7+ Kf1 Qd7',
  },
  {
    title: 'Man falls to machine',
    who: 'Deep Blue – Kasparov, New York 1997, game six',
    note: 'The last move of the match. A computer had beaten the champion.',
    moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Ng5 Ngf6 Bd3 e6 N1f3 h6 Nxe6 Qe7 O-O fxe6 Bg6+ Kd8 Bf4 b5 a4 Bb7 Re1 Nd5 Bg3 Kc8 axb5 cxb5 Qd3 Bc6 Bf5 exf5 Rxe7 Bxe7 c4',
  },
  {
    title: 'The first machine win',
    who: 'Deep Blue – Kasparov, Philadelphia 1996, game one',
    note: 'The first time a computer beat a reigning champion at tournament pace.',
    moves: 'e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 Bg4 Be2 e6 h3 Bh5 O-O Nc6 Be3 cxd4 cxd4 Bb4 a3 Ba5 Nc3 Qd6 Nb5 Qe7 Ne5 Bxe2 Qxe2 O-O Rac1 Rac8 Bg5 Bb6 Bxf6 gxf6 Nc4 Rfd8 Nxb6 axb6 Rfd1 f5 Qe3 Qf6 d5 Rxd5 Rxd5 exd5 b3 Kh8 Qxb6 Rg8 Qc5 d4 Nd6 f4 Nxb7 Ne5 Qd5 f3 g3 Nd3 Rc7 Re8 Nd6 Re1+ Kh2 Nxf2 Nxf7+ Kg7 Ng5+ Kh6 Rxh7+',
  },
  {
    title: 'Mate in eleven moves',
    who: 'Réti – Tartakower, Vienna 1910',
    note: 'A queen sacrifice, a double check, and it is over.',
    moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Qd3 e5 dxe5 Qa5+ Bd2 Qxe5 O-O-O Nxe4 Qd8+ Kxd8 Bg5+ Kc7 Bd8#',
  },
  {
    title: 'The untouchable rook',
    who: 'Steinitz – von Bardeleben, Hastings 1895',
    note: 'The rook cannot be taken, and keeps giving check.',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3 d5 exd5 Nxd5 O-O Be6 Bg5 Be7 Bxd5 Bxd5 Nxd5 Qxd5 Bxe7 Nxe7 Re1 f6 Qe2 Qd7 Rac1 c6 d5 cxd5 Nd4 Kf7 Ne6 Rhc8 Qg4 g6 Ng5+ Ke8 Rxe7+',
  },
  {
    title: 'The windmill',
    who: 'C. Torre – Em. Lasker, Moscow 1925',
    note: 'The queen is offered to set the rook and bishop turning.',
    moves: 'd4 Nf6 Nf3 e6 Bg5 c5 e3 cxd4 exd4 Be7 Nbd2 d6 c3 Nbd7 Bd3 b6 Nc4 Bb7 Qe2 Qc7 O-O O-O Rfe1 Rfe8 Rad1 Nf8 Bc1 Nd5 Ng5 b5 Na3 b4 cxb4 Nxb4 Qh5 Bxg5 Bxg5 Nxd3 Rxd3 Qa5 b4 Qf5 Rg3 h6 Nc4 Qd5 Ne3 Qb5 Bf6',
  },
  {
    title: 'The octopus',
    who: 'Karpov – Kasparov, World Championship 1985',
    note: 'A knight settles deep in White’s camp and holds it fast.',
    moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nb5 d6 c4 Nf6 N1c3 a6 Na3 d5 cxd5 exd5 exd5 Nb4 Be2 Bc5 O-O O-O Bf3 Bf5 Bg5 Re8 Qd2 b5 Rad1 Nd3',
  },
  {
    title: 'Two bishops for two pawns',
    who: 'Em. Lasker – Bauer, Amsterdam 1889',
    note: 'The second bishop goes, stripping the king bare.',
    moves: 'f4 d5 e3 Nf6 b3 e6 Bb2 Be7 Bd3 b6 Nc3 Bb7 Nf3 Nbd7 O-O O-O Ne2 c5 Ng3 Qc7 Ne5 Nxe5 Bxe5 Qc6 Qe2 a6 Nh5 Nxh5 Bxh7+ Kxh7 Qxh5+ Kg8 Bxg7',
  },
  {
    title: 'Morphy takes the knight’s guard',
    who: 'Paulsen – Morphy, New York 1857',
    note: 'The queen takes a bishop to tear open the white king.',
    moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bc5 O-O O-O Nxe5 Re8 Nxc6 dxc6 Bc4 b5 Be2 Nxe4 Nxe4 Rxe4 Bf3 Re6 c3 Qd3 b4 Bb6 a4 bxa4 Qxa4 Bd7 Ra2 Rae8 Qa6 Qxf3',
  },
  {
    title: 'The bishop to a3',
    who: 'Botvinnik – Capablanca, AVRO 1938',
    note: 'A bishop is offered to drag the queen away.',
    moves: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 d5 a3 Bxc3+ bxc3 c5 cxd5 exd5 Bd3 O-O Ne2 b6 O-O Ba6 Bxa6 Nxa6 Bb2 Qd7 a4 Rfe8 Qd3 c4 Qc2 Nb8 Rae1 Nc6 Ng3 Na5 f3 Nb3 e4 Qxa4 e5 Nd7 Qf2 g6 f4 f5 exf6 Nxf6 f5 Rxe1 Rxe1 Re8 Re6 Rxe6 fxe6 Kg7 Qf4 Qe8 Qe5 Qe7 Ba3',
  },
  {
    title: 'Fischer’s rook to f6',
    who: 'Fischer – Benko, US Championship 1963',
    note: 'The rook shuts the door on Black’s defence.',
    moves: 'e4 g6 d4 Bg7 Nc3 d6 f4 Nf6 Nf3 O-O Bd3 Bg4 h3 Bxf3 Qxf3 Nc6 Be3 e5 dxe5 dxe5 f5 gxf5 Qxf5 Nd4 Qf2 Ne8 O-O Nd6 Qg3 Kh8 Qg4 c6 Qh5 Qe8 Bxd4 exd4 Rf6',
  },
  {
    title: 'A modern immortal',
    who: 'Aronian – Anand, Wijk aan Zee 2013',
    note: 'The last move, with the black pieces trained on the king.',
    moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 Bd6 O-O O-O Qc2 Bb7 a3 Rc8 Ng5 c5 Nxh7 Ng4 f4 cxd4 exd4 Bc5 Be2 Nde5 Bxg4 Bxd4+ Kh1 Nxg4 Nxf8 f5 Ng6 Qf6 h3 Qxg6 Qe2 Qh5 Qd3 Be3',
  },
  {
    title: 'The gambit James Bond saw',
    who: 'Spassky – Bronstein, Leningrad 1960',
    note: 'This game inspired the match in From Russia with Love.',
    moves: 'e4 e5 f4 exf4 Nf3 d5 exd5 Bd6 Nc3 Ne7 d4 O-O Bd3 Nd7 O-O h6 Ne4 Nxd5 c4 Ne3 Bxe3 fxe3 c5 Be7 Bc2 Re8 Qd3 e2 Nd6 Nf8 Nxf7',
  },
  {
    title: 'A queen with check',
    who: 'Anand – Carlsen, World Championship 2013',
    note: 'Carlsen makes a new queen. Anand slipped on the next move and resigned.',
    moves: 'd4 Nf6 c4 e6 Nc3 Bb4 f3 d5 a3 Bxc3+ bxc3 c5 cxd5 exd5 e3 c4 Ne2 Nc6 g4 O-O Bg2 Na5 O-O Nb3 Ra2 b5 Ng3 a5 g5 Ne8 e4 Nxc1 Qxc1 Ra6 e5 Nc7 f4 b4 axb4 axb4 Rxa6 Nxa6 f5 b3 Qf4 Nc7 f6 g6 Qh4 Ne8 Qh6 b2 Rf4 b1=Q+',
  },
  {
    title: 'The queen sacrifice that kept the crown',
    who: 'Carlsen – Karjakin, World Championship tiebreak 2016',
    note: 'The last move of the match: mate comes next whatever Black does.',
    moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 f3 e5 Nb3 Be7 c4 a5 Be3 a4 Nc1 O-O Nc3 Qa5 Qd2 Na6 Be2 Nc5 O-O Bd7 Rb1 Rfc8 b4 axb3 axb3 Qd8 Nd3 Ne6 Nb4 Bc6 Rfd1 h5 Bf1 h4 Qf2 Nd7 g3 Ra3 Bh3 Rca8 Nc2 R3a6 Nb4 Ra5 Nc2 b6 Rd2 Qc7 Rbd1 Bf8 gxh4 Nf4 Bxf4 exf4 Bxd7 Qxd7 Nb4 Ra3 Nxc6 Qxc6 Nb5 Rxb3 Nd4 Qxc4 Nxb3 Qxb3 Qe2 Be7 Kg2 Qe6 h5 Ra3 Rd3 Ra2 R3d2 Ra3 Rd3 Ra7 Rd5 Rc7 Qd2 Qf6 Rf5 Qh4 Rc1 Ra7 Qxf4 Ra2+ Kh1 Qf2 Rc8+ Kh7 Qh6+',
  },
  {
    title: 'Carlsen closes the match',
    who: 'Carlsen – Caruana, World Championship tiebreak 2018',
    note: 'A new queen, in the third rapid win in a row that kept the title.',
    moves: 'e4 c5 Nf3 e6 c4 Nc6 d4 cxd4 Nxd4 Bc5 Nc2 Nf6 Nc3 O-O Be3 b6 Be2 Bb7 O-O Qe7 Qd2 Rfd8 Rfd1 Ne5 Bxc5 bxc5 f4 Ng6 Qe3 d6 Rd2 a6 Rad1 Qc7 b3 h6 g3 Rd7 Bf3 Re8 Qf2 Ne7 h3 Red8 Bg2 Nc6 g4 Qa5 Na4 Qc7 e5 dxe5 Nxc5 Rxd2 Rxd2 Rxd2 Qxd2 Ba8 fxe5 Qxe5 Nd7 Qb2 Qd6 Nxd7 Qxd7 Qxc2 Qe8+ Kh7 Qxa8 Qd1+ Kh2 Qd6+ Kh1 Nd4 Qe4+ f5 gxf5 exf5 Qe3 Ne6 b4 Ng5 c5 Qf6 c6 Ne6 a4 Nc7 Qf4 Ne6 Qd6 Qa1+ Kh2 Nd4 c7 Qc3 Qc5 Qe3 c8=Q',
  },
  {
    title: 'One hundred and thirty-six moves',
    who: 'Carlsen – Nepomniachtchi, World Championship 2021',
    note: 'The longest game in the history of the World Championship ends here.',
    moves: 'd4 Nf6 Nf3 d5 g3 e6 Bg2 Be7 O-O O-O b3 c5 dxc5 Bxc5 c4 dxc4 Qc2 Qe7 Nbd2 Nc6 Nxc4 b5 Nce5 Nb4 Qb2 Bb7 a3 Nc6 Nd3 Bb6 Bg5 Rfd8 Bxf6 gxf6 Rac1 Nd4 Nxd4 Bxd4 Qa2 Bxg2 Kxg2 Qb7+ Kg1 Qe4 Qc2 a5 Rfd1 Kg7 Rd2 Rac8 Qxc8 Rxc8 Rxc8 Qd5 b4 a4 e3 Be5 h4 h5 Kh2 Bb2 Rc5 Qd6 Rd1 Bxa3 Rxb5 Qd7 Rc5 e5 Rc2 Qd5 Rdd2 Qb3 Ra2 e4 Nc5 Qxb4 Nxe4 Qb3 Rac2 Bf8 Nc5 Qb5 Nd3 a3 Nf4 Qa5 Ra2 Bb4 Rd3 Kh6 Rd1 Qa4 Rda1 Bd6 Kg1 Qb3 Ne2 Qd3 Nd4 Kh7 Kh2 Qe4 Rxa3 Qxh4+ Kg1 Qe4 Ra4 Be5 Ne2 Qc2 R1a2 Qb3 Kg2 Qd5+ f3 Qd1 f4 Bc7 Kf2 Bb6 Ra1 Qb3 Re4 Kg7 Re8 f5 Raa8 Qb4 Rac8 Ba5 Rc1 Bb6 Re5 Qb3 Re8 Qd5 Rcc8 Qh1 Rc1 Qd5 Rb1 Ba7 Re7 Bc5 Re5 Qd3 Rb7 Qc2 Rb5 Ba7 Ra5 Bb6 Rab5 Ba7 Rxf5 Qd3 Rxf7+ Kxf7 Rb7+ Kg6 Rxa7 Qd5 Ra6+ Kh7 Ra1 Kg6 Nd4 Qb7 Ra2 Qh1 Ra6+ Kf7 Nf3 Qb1 Rd6 Kg7 Rd5 Qa2+ Rd2 Qb1 Re2 Qb6 Rc2 Qb1 Nd4 Qh1 Rc7+ Kf6 Rc6+ Kf7 Nf3 Qb1 Ng5+ Kg7 Ne6+ Kf7 Nd4 Qh1 Rc7+ Kf6 Nf3 Qb1 Rd7 Qb2+ Rd2 Qb1 Ng1 Qb4 Rd1 Qb3 Rd6+ Kg7 Rd4 Qb2+ Ne2 Qb1 e4 Qh1 Rd7+ Kg8 Rd4 Qh2+ Ke3 h4 gxh4 Qh3+ Kd2 Qxh4 Rd3 Kf8 Rf3 Qd8+ Ke3 Qa5 Kf2 Qa7+ Re3 Qd7 Ng3 Qd2+ Kf3 Qd1+ Re2 Qb3+ Kg2 Qb7 Rd2 Qb3 Rd5 Ke7 Re5+ Kf7 Rf5+ Ke8 e5 Qa2+ Kh3 Qe6 Kh4 Qh6+ Nh5 Qh7 e6 Qg6 Rf7 Kd8 f5 Qg1 Ng7',
  },
  {
    title: 'Ding takes the crown',
    who: 'Nepomniachtchi – Ding, World Championship tiebreak 2023',
    note: 'Ding’s last move of the match. He became world champion.',
    moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 d3 b5 Bb3 d6 a4 Bd7 h3 O-O Be3 Na5 Ba2 bxa4 Nc3 Rb8 Bb1 Qe8 b3 c5 Nxa4 Nc6 Nc3 a5 Nd2 Be6 Nc4 d5 exd5 Nxd5 Bd2 Nxc3 Bxc3 Bxc4 bxc4 Bd8 Bd2 Bc7 c3 f5 Re1 Rd8 Ra2 Qg6 Qe2 Qd6 g3 Rde8 Qf3 e4 dxe4 Ne5 Qg2 Nd3 Bxd3 Qxd3 exf5 Rxe1+ Bxe1 Qxc4 Ra1 Rxf5 Bd2 h6 Qc6 Rf7 Re1 Kh7 Be3 Be5 Qe8 Bxc3 Rc1 Rf6 Qd7 Qe2 Qd5 Bb4 Qe4+ Kg8 Qd5+ Kh7 Qe4+ Rg6 Qf5 c4 h4 Qd3 Qf3 Rf6 Qg4 c3 Rd1 Qg6 Qc8 Rc6 Qa8 Rd6 Rxd6 Qxd6 Qe4+ Qg6 Qc4 Qb1+ Kh2 a4 Bd4 a3 Qc7 Qg6 Qc4 c2 Be3 Bd6 Kg2 h5 Kf1 Be5 g4 hxg4 h5 Qf5 Qd5 g3 f4 a2 Qxa2 Bxf4',
  },
  {
    title: 'The slip that crowned Gukesh',
    who: 'Ding – Gukesh, World Championship 2024',
    note: 'This rook move was the fatal error. Gukesh became the youngest undisputed champion.',
    moves: 'Nf3 d5 g3 c5 Bg2 Nc6 d4 e6 O-O cxd4 Nxd4 Nge7 c4 Nxd4 Qxd4 Nc6 Qd1 d4 e3 Bc5 exd4 Bxd4 Nc3 O-O Nb5 Bb6 b3 a6 Nc3 Bd4 Bb2 e5 Qd2 Be6 Nd5 b5 cxb5 axb5 Nf4 exf4 Bxc6 Bxb2 Qxb2 Rb8 Rfd1 Qb6 Bf3 fxg3 hxg3 b4 a4 bxa3 Rxa3 g6 Qd4 Qb5 b4 Qxb4 Qxb4 Rxb4 Ra8 Rxa8 Bxa8 g5 Bd5 Bf5 Rc1 Kg7 Rc7 Bg6 Rc4 Rb1+ Kg2 Re1 Rb4 h5 Ra4 Re5 Bf3 Kh6 Kg1 Re6 Rc4 g4 Bd5 Rd6 Bb7 Kg5 f3 f5 fxg4 hxg4 Rb4 Bf7 Kf2 Rd2+ Kg1 Kf6 Rb6+ Kg5 Rb4 Be6 Ra4 Rb2 Ba8 Kf6 Rf4 Ke5 Rf2',
  },
  {
    title: 'Hikaru mates Magnus',
    who: 'Hikaru – Magnus Carlsen, Chess.com blitz 2016',
    note: 'Nakamura finishes Carlsen off on the board.',
    moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 Re1 Nd6 Nxe5 Be7 Bf1 O-O Nc3 Nxe5 Rxe5 Ne8 Nd5 Bd6 Re1 c6 Ne3 Bc7 Nf5 d5 Ne7+ Kh8 Nxc8 Rxc8 g3 Nd6 Bh3 f5 d3 Qd7 Qh5 Rce8 Bf4 g6 Qf3 Nf7 Bd2 Rxe1+ Rxe1 Re8 Qd1 Kg8 a4 a6 a5 Qd8 b4 Rxe1+ Qxe1 Ne5 Qe2 d4 Bg2 Qd7 Bf4 Nf7 Bd2 Nd8 c4 dxc3 Bxc3 Ne6 d4 Bd8 d5 cxd5 Qe5 d4 Bd5 Kf7 Bxd4 Be7 Qg7+ Ke8 Qg8+ Nf8 Qf7+ Kd8 Bb6+ Kc8 Bb3 Bd6 Qc4+ Qc6 Qd4 Bc7 Qg7 Bxb6 axb6 Qc1+ Kg2 Qc6+ Kh3 Qd6 Bd5 Nd7 Qg8+ Nf8 Qf7 Nd7 Qe8#',
  },
  {
    title: 'Magnus mates Hikaru',
    who: 'Magnus Carlsen – Hikaru, Chess.com blitz 2023',
    note: 'The old rivals again, and this time it is Carlsen who gives mate.',
    moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8 Nc3 Bd7 h3 Kc8 b3 h6 Bb2 Ne7 Ne2 Ng6 Rfe1 c5 h4 Bg4 Nh2 Bxe2 Rxe2 Nf4 Re4 Ne6 h5 Be7 f4 g6 hxg6 fxg6 g4 Rf8 Rf1 Ng7 e6 Ne8 f5 gxf5 gxf5 h5 Ref4 Nf6 Rh4 Rg8+ Kh1 Rg5 Rhf4 b6 Nf3 Rg8 Ne5 Bd6 Ng6 Bxf4 Ne7+ Kb7 Nxg8 Rxg8 Rxf4 Nd5 Rf3 Re8 c4 Ne7 f6 Ng6 Rg3 Nf8 e7 Nd7 Re3 Nxf6 Bxf6 Kc6 Rd3 h4 Rd8 Rxe7 Bxe7 h3 Kh2 a6 Kxh3 b5 Kg4 b4 Rd5 a5 Rxc5+ Kd7 Bf6 c6 Rxa5 Kd6 Bd4 c5 Bxc5+ Ke5 Bxb4+ Ke4 Rd5 Ke3 Kg3 Ke4 a4 Ke3 a5 Ke4 a6 Ke3 a7 Ke2 a8=Q Kf1 Qa1+ Ke2 Qe1#',
  },
  {
    title: 'GothamChess topples Caruana',
    who: 'Fabiano Caruana – GothamChess, Chess.com blitz 2026',
    note: 'Levy Rozman mates a former World Championship challenger.',
    moves: 'd4 Nf6 c4 b6 Nc3 Bb7 Qc2 Nc6 Nf3 e6 a3 g6 e4 Bg7 h3 d6 Be3 Qe7 Be2 O-O O-O e5 d5 Nb8 b4 Nbd7 Nd2 c5 dxc6 Bxc6 Nd5 Bxd5 cxd5 Rfc8 Qb3 Qf8 Rac1 Bh6 Rc6 Bxe3 Qxe3 Ne8 Rfc1 Rd8 Qg3 Qe7 Bb5 Nb8 R6c2 a6 Bxe8 Qxe8 Nc4 Qb5 Nxd6 Rxd6 Rc8+ Kg7 Qxe5+ Rf6 Qe7 g5 Qf8+ Kg6 Rxb8 Rxb8 Qxb8 Qe2 Qg3 Qxe4 Rd1 Qe2 Qd3+ Qxd3 Rxd3 Rd6 Rc3 Kf5 g4+ Ke5 Rc7 f6 Rxh7 Kxd5 Ra7 b5 Rc7 Ke5 Rc5+ Ke6 Kg2 Kd7 Rf5 Ke7 Rf3 Rd4 Re3+ Kf7 Kg3 a5 bxa5 Ra4 h4 gxh4+ Kxh4 f5 f3 fxg4 fxg4 Rxa5 Rf3+ Kg7 Rb3 Kg6 Rc3 Ra6 Rb3 Rb6 Rd3 Kf6 Rb3 Ke5 Re3+ Kf4 Rg3 Rh6#',
  },
  {
    title: 'GothamChess against penguingm1',
    who: 'GothamChess – penguingm1, Chess.com blitz 2024',
    note: 'Levy Rozman gives mate against Grandmaster Andrew Tang.',
    moves: 'e4 e5 Nf3 Nc6 c3 d5 Qa4 f6 Bb5 Ne7 exd5 Qxd5 d4 a6 Be2 Bd7 Qd1 Ng6 O-O Bd6 c4 Qf7 c5 Be7 d5 Nb4 d6 cxd6 cxd6 Bd8 Nc3 O-O a3 Nc6 Nd5 Be6 Bc4 Kh8 Be3 Qd7 Bc5 Rc8 Rc1 Re8 Re1 Na5 Ba2 Nf4 Nxf4 Bxa2 Nd5 Bb3 Qd3 e4 Rxe4 Rxe4 Qxe4 b6 Be3 Rxc1+ Bxc1 Nc6 h3 f5 Qd3 Ba4 Nf4 Bb5 Qd1 Bf6 b4 Ne5 Qd5 Bc6 Nxe5 Bxe5 Qxe5 Kg8 Bb2 Kf7 Qxg7+ Ke8 Qg8#',
  },
];
