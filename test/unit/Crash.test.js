const {developmentChains} = require("../../helper-hardhat-config")
const {getNamedAccounts, deployments, ethers, network} = require("hardhat")
const {assert, expect} = require("chai")
const {exp} = require("prb-math");


!developmentChains.includes(network.name) ? describe.skip : describe("Crash Unit Tests", async function () {
    let crash, vrfCoordinatorV2Mock, crashMinimumBet, deployer

    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        crash = await ethers.getContract("Crash", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
        crashMinimumBet = await crash.getMinimumBet()
    })

    describe("constructor", function () {
        it("initializes crash correctly", async function () {
            const crashState = await crash.getCrashState()
            assert.equal(crashState.toString(), "1")
        })
    })

    describe("enterGame", function () {
        it("reverts if don't bet enough", async function () {
            await expect(crash.enterGame()).to.be.revertedWith("Crash__MoreRequiredToEnter()")
        })

        it("records player when they enter", async function () {
            await crash.enterGame({value: crashMinimumBet})
            const playerFromContract = await crash.getPlayer(0)
            assert.equal(playerFromContract, deployer)
        })

        it("emits event on enter", async function () {
            await expect(crash.enterGame({value: crashMinimumBet})).to.emit(crash, "EnteredGame")
        })

        it("doesn't allow people to enter when game is closed", async function () {
            await crash.enterGame({value: crashMinimumBet})
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])

            await crash.performUpkeep([])
            await expect(crash.enterGame({value: crashMinimumBet})).to.be.revertedWith("Crash__GameNotOpen")
        })
    })

    describe("pullOut", function () {
        it("returns error if the player has tried to pull out after crash", async function () {
            const accounts = await ethers.getSigners()
            const loser = crash.connect(accounts[1])
            await loser.enterGame({value: crashMinimumBet})

            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])

            await crash.performUpkeep([])

            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await crash.performUpkeep([])

            await expect(loser.pullOut()).to.be.revertedWith("Crash__PlayerLost")
        })

        it("returns error if player is not playing", async function () {
            const accounts = await ethers.getSigners()
            const notPlaying = crash.connect(accounts[1])

            await expect(notPlaying.pullOut()).to.be.revertedWith("PlayerNotPlaying")
        })

        it("rewards player for playing and pulling out before crash and event is emitted", async function () {
            const accounts = await ethers.getSigners()
            const winner = crash.connect(accounts[1])
            await winner.enterGame({value: crashMinimumBet})

            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])

            await crash.performUpkeep([])

            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await winner.pullOut()

            const winnerBalance = await accounts[1].getBalance()
            assert.isAbove(winnerBalance.toString(), crashMinimumBet)
        })
    })

    describe("checkUpkeep", function () {
        it("returns false if time requirement is false during betting period", async function () {

            const {upkeepNeeded} = await crash.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)

            const crashState = await crash.getCrashState()
            assert.equal(crashState.toString(), "1")
        })

        it("returns false if time requirement is false during game period", async function () {
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await crash.performUpkeep([])

            const {upkeepNeeded} = await crash.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)

            const crashState = await crash.getCrashState()
            assert.equal(crashState.toString(), "0")
        })

        it("returns true if betting phase is over", async function () {
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])

            const {upkeepNeeded} = await crash.callStatic.checkUpkeep([])
            assert(upkeepNeeded)
        })

        it("returns true if the game round is over", async function () {
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await crash.performUpkeep([])

            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            const {upkeepNeeded} = await crash.callStatic.checkUpkeep([])
            assert(upkeepNeeded)

            const crashState = await crash.getCrashState()
            assert.equal(crashState.toString(), "0")
        })
    })

    describe("performUpkeep", function () {
        it("can only run if checkUpkeep is true after betting phase", async function () {
            await crash.enterGame({value: crashMinimumBet})
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])

            const tx = await crash.performUpkeep([])
            assert(tx)
        })

        it("can only run if checkUpkeep is true after crashing", async function () {
            await crash.enterGame({value: crashMinimumBet})
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await crash.performUpkeep([])

            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])

            const tx = await crash.performUpkeep([])
            assert(tx)
        })

        it("reverts when checkUpkeep is false", async function () {
            const crashState = await crash.getCrashState()
            assert.equal(crashState.toString(), "1")

            await expect(crash.performUpkeep([])).to.be.revertedWith("Crash__UpkeepNotNeeded")
        })

        it("updates raffle state, emits event, and call vrf coordinator", async function () {
            await crash.enterGame({value: crashMinimumBet})
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await crash.performUpkeep([])

            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            const tx = await crash.performUpkeep([])
            const txReceipt = await tx.wait(1)
            const requestId = txReceipt.events[1].args.requestId
            const crashState = await crash.getCrashState()

            assert(requestId.toNumber() > 0)
            assert(crashState.toString() == 2)
        })
    })

    describe("fulfillRandomWords", function () {
        beforeEach(async function () {
            await crash.enterGame({value: crashMinimumBet})
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await crash.performUpkeep([])

            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            await network.provider.send("evm_mine", [])
            // await crash.performUpkeep([])
        })

        it("can only be called after performUpkeep when game has crashed", async function () {
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, crash.address)).to.be.revertedWith("nonexistent request")
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, crash.address)).to.be.revertedWith("nonexistent request")
        })

        it("will reset players, change crash state and emit event", async function () {
            const tx = await crash.performUpkeep([])
            const txReceipt = await tx.wait(1)
            await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, crash.address)


        })


    })
})