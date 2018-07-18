// @flow
import type { NpmDeployment, BinaryDeployment, DockerDeployment } from '../../util/types'
import getScaleForDC from './get-scale-for-dc'

function shouldCopyScalingAttributes(origin: NpmDeployment | BinaryDeployment | DockerDeployment, dest: NpmDeployment | BinaryDeployment | DockerDeployment) {
  return Boolean(origin.scale) &&
    getScaleForDC('bru1', origin).min !== getScaleForDC('bru1', dest).min ||
    getScaleForDC('bru1', origin).max !== getScaleForDC('bru1', dest).max ||
    getScaleForDC('sfo1', origin).min !== getScaleForDC('sfo1', dest).min ||
    getScaleForDC('sfo1', origin).max !== getScaleForDC('sfo1', dest).max
}

export default shouldCopyScalingAttributes
