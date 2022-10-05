//SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";

    error Crash__MoreRequiredToEnter();
    error Crash__GameNotOpen();
    error Crash__TransferFailed();
    error Crash__UpkeepNotNeeded(uint256 blocknumber, uint256 playerCount, uint256 crashState);
    error Crash__PlayerLost();
    error Crash__PlayerNotPlaying();

contract Crash is VRFConsumerBaseV2, KeeperCompatibleInterface{
    struct Player {
        PlayerState playerState;
        address payable playerAddress;
        uint256 betAmount;
    }

    enum CrashState {
        CLOSED,
        GETTING_BETS,
        CRASHED
    }

    enum PlayerState {
        IN,
        OUT
    }

    //VRF VARIABLES
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    uint64 private immutable i_subscriptionId;
    bytes32 private immutable i_gasLane;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 3;

    //CRASH VARIABLES
    uint256 private immutable i_minimumBet;
    mapping(address => Player) public players;
    address[] public s_playerList;
    CrashState private s_crashState;
    uint256 private s_interval = 3;
    uint256 private s_startTimeStamp;
    uint256 private constant MULTIPLIER = 102 * (10**16);
    uint256 public constant BETINTERVAL = 10;


    //EVENTS
    event EnteredGame(address indexed player);
    event Congratulations(address indexed player);
    event Crashed(uint256 indexed requestId);
    event CrashOpen();
    event BetsClosed();

    constructor(
        address vrfCoordinatorV2,
        uint64 subscriptionId,
        bytes32 gasLane, // keyHash
        uint256 minimumBet,
        uint32 callbackGasLimit
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_minimumBet = minimumBet;
        s_crashState = CrashState.GETTING_BETS;
        s_startTimeStamp = block.number;
        i_callbackGasLimit = callbackGasLimit;

        //i_vrfCoordinator.requestRandomWords(i_gasLane, i_subscriptionId, REQUEST_CONFIRMATIONS, i_callbackGasLimit, NUM_WORDS);
    }

    function enterGame() public payable {
        if (msg.value < i_minimumBet) {
            revert Crash__MoreRequiredToEnter();
        }
        if (s_crashState != CrashState.GETTING_BETS) {
            revert Crash__GameNotOpen();
        }

        Player memory templayer = Player(PlayerState.IN, payable(msg.sender), msg.value);
        players[msg.sender] = templayer;
        s_playerList.push(msg.sender);


        emit EnteredGame(msg.sender);
    }

    function pullOut() public {
        Player memory player = players[msg.sender];
        if (player.betAmount == 0) {
            revert Crash__PlayerNotPlaying();
        }

        if (s_crashState != CrashState.CLOSED) {
            revert Crash__PlayerLost();
        }

        player.playerState = PlayerState.OUT;
        address payable winner = players[msg.sender].playerAddress;
        uint256 timeSpan = (block.number - s_startTimeStamp);
        uint256 reward = PRBMathUD60x18.mul(player.betAmount,(PRBMathUD60x18.pow(MULTIPLIER, timeSpan)));
        (bool success, ) = winner.call{value: reward}("");

        if (!success) {
            revert Crash__TransferFailed();
        }
        emit Congratulations(winner);
    }

    function checkUpkeep(bytes memory /* checkData */)public view override returns (bool upkeepNeeded, bytes memory /* performData */) {
        bool isClosed = CrashState.CLOSED == s_crashState;
        int256 tempInterval = (int256(block.number) - int256(s_startTimeStamp + BETINTERVAL));
        bool timePassed = (tempInterval >= int256(s_interval));
        upkeepNeeded = (isClosed && timePassed);

        bool isGettingBets = CrashState.GETTING_BETS == s_crashState;
        bool passedBettingInterval = (block.number - s_startTimeStamp) >= BETINTERVAL;
        upkeepNeeded = upkeepNeeded || (isGettingBets && passedBettingInterval);

        return (upkeepNeeded, "0x0");

    }

    function performUpkeep(bytes calldata) external override {
        if (s_crashState == CrashState.GETTING_BETS) {
            (bool upkeepNeeded, ) = checkUpkeep("");

            if (!upkeepNeeded) {
                revert Crash__UpkeepNotNeeded(
                    block.number,
                    s_playerList.length,
                    uint256(s_crashState)
                );
            }

            s_crashState = CrashState.CLOSED;

            emit BetsClosed();
        } else {
            (bool upkeepNeeded, ) = checkUpkeep("");

            if (!upkeepNeeded) {
                revert Crash__UpkeepNotNeeded(
                    block.number,
                    s_playerList.length,
                    uint256(s_crashState)
                );
            }

            s_crashState = CrashState.CRASHED;

            uint256 requestId = i_vrfCoordinator.requestRandomWords(i_gasLane, i_subscriptionId, REQUEST_CONFIRMATIONS, i_callbackGasLimit, NUM_WORDS);

            emit Crashed(requestId);
        }

    }

    function fulfillRandomWords(uint256, uint256[] memory randomWords) internal override {
        uint256 numOne = randomWords[0] % 10;
        uint256 numTwo = randomWords[1] % 10;
        uint256 numThree = randomWords[2] % 10;

        s_interval = numOne + numTwo + numThree;

        for (uint256 i = 0; i < s_playerList.length; i++) {
            delete players[s_playerList[i]];
        }

        s_playerList = new address[](0);
        s_startTimeStamp = block.number;

        s_crashState = CrashState.GETTING_BETS;
        emit CrashOpen();

    }

    function getCrashState() public view returns (CrashState) {
        return s_crashState;
    }

    function getMinimumBet() public view returns(uint256) {
        return i_minimumBet;
    }

    function getNumberPlayers() public view returns(uint256) {
        return s_playerList.length;
    }

    function getPlayer(uint256 index) public view returns(address) {
        return s_playerList[index];
    }

    function getCurrentBlock() public view returns(uint256) {
        return block.number;
    }


}