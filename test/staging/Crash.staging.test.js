const {getNamedAccounts, deployments, ethers, network} = require("hardhat");
const {assert, expect} = require("chai")
const {developmentChains, networkConfig} = require("../../helper-hardhat-config")

developmentChains.includes(network.name) ? describe.skip :
describe("Raffle Unit Tests", async function () {
    let crash, crashMinimumBet, deployer

    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        crash = await ethers.getContract("Crash", deployer)
        crashMinimumBet = await crash.getMinimumBet()
    })

    describe("fulfillRandomWords", function () {
        it("works with Chainlink Keepers and Chainlink VRF, get random intervals", async function () {
            const startingBlock = await crash.getCurrentBlock()
            const accounts = await ethers.getSigners()

            await new Promise(async (resolve, reject) => {
                crash.once("Crashed", async () => {
                    console.log("Game Crashed!! WWWW")
                    try {
                        // const endingBlock = await crash.getCurrentBlock()
                        // const winnerEndingBalance = await accounts[0].getBalance()
                        // const numPlayers = await crash.getNumberPlayers().toString()
                        // const crashState = await crash.getCrashState().toString()
                        //
                        // await assert.equal(numPlayers, "1")
                        //
                        // assert.equal(crashState, "2")

                        // assert(endingBlock > startingBlock)
                        resolve()
                    } catch (error) {
                        console.log(error)
                        reject(e)
                    }
                })

                //Entering game
                await crash.enterGame({value: ethers.utils.parseEther("0.01")})
                const winnerStartingBalance = await accounts[0].getBalance()
                //Pulling out
                await crash.pullOut()

            })

        })
    })
})