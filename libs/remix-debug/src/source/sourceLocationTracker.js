'use strict'
const EventManager = require('../eventManager')
const helper = require('../trace/traceHelper')
const SourceMappingDecoder = require('./sourceMappingDecoder')
const remixLib = require('@remix-project/remix-lib')
const util = remixLib.util

/**
 * Process the source code location for the current executing bytecode
 */
function SourceLocationTracker (_codeManager, { debugWithGeneratedSources }) {
  this.opts = {
    debugWithGeneratedSources: debugWithGeneratedSources || false
  }
  this.codeManager = _codeManager
  this.event = new EventManager()
  this.sourceMappingDecoder = new SourceMappingDecoder()
  this.sourceMapByAddress = {}
}

/**
 * Return the source location associated with the given @arg index
 *
 * @param {String} address - contract address from which the source location is retrieved
 * @param {Int} index - index in the instruction list from where the source location is retrieved
 * @param {Object} contractDetails - AST of compiled contracts
 * @param {Function} cb - callback function
 */
SourceLocationTracker.prototype.getSourceLocationFromInstructionIndex = async function (address, index, contracts) {
  const sourceMap = await extractSourceMap(this, this.codeManager, address, contracts)
  return this.sourceMappingDecoder.atIndex(index, sourceMap.map)
}

/**
 * Return the source location associated with the given @arg pc
 *
 * @param {String} address - contract address from which the source location is retrieved
 * @param {Int} vmtraceStepIndex - index of the current code in the vmtrace
 * @param {Object} contractDetails - AST of compiled contracts
 * @param {Function} cb - callback function
 */
SourceLocationTracker.prototype.getSourceLocationFromVMTraceIndex = async function (address, vmtraceStepIndex, contracts) {
  const sourceMap = await extractSourceMap(this, this.codeManager, address, contracts)
  const index = this.codeManager.getInstructionIndex(address, vmtraceStepIndex)
  return this.sourceMappingDecoder.atIndex(index, sourceMap.map)
}

/**
 * Returns the generated sources from a specific @arg address
 *
 * @param {String} address - contract address from which has generated sources
 * @param {Object} generatedSources - Object containing the sourceid, ast and the source code.
 */
SourceLocationTracker.prototype.getGeneratedSourcesFromAddress = function (address) {
  if (!this.debugWithGeneratedSources) return null
  if (this.sourceMapByAddress[address]) return this.sourceMapByAddress[address].generatedSources
  return null
}

SourceLocationTracker.prototype.clearCache = function () {
  this.sourceMapByAddress = {}
}

function getSourceMap (address, code, contracts) {
  const isCreation = helper.isContractCreation(address)
  let bytes
  for (let file in contracts) {
    for (let contract in contracts[file]) {
      const bytecode = contracts[file][contract].evm.bytecode
      const deployedBytecode = contracts[file][contract].evm.deployedBytecode
      if (!deployedBytecode) continue

      bytes = isCreation ? bytecode.object : deployedBytecode.object
      if (util.compareByteCode(code, '0x' + bytes)) {
        const generatedSources = isCreation ? bytecode.generatedSources : deployedBytecode.generatedSources
        const map = isCreation ? bytecode.sourceMap : deployedBytecode.sourceMap
        return { generatedSources, map }
      }
    }
  }
  return null
}

function extractSourceMap (self, codeManager, address, contracts) {
  return new Promise((resolve, reject) => {
    if (self.sourceMapByAddress[address]) return resolve(self.sourceMapByAddress[address])

    codeManager.getCode(address).then((result) => {
      const sourceMap = getSourceMap(address, result.bytecode, contracts)
      if (sourceMap) {
        if (!helper.isContractCreation(address)) self.sourceMapByAddress[address] = sourceMap
        resolve(sourceMap)
      } else {
        reject('no sourcemap associated with the code ' + address)
      }
    }).catch(reject)
  })
}

module.exports = SourceLocationTracker
