/**
 * 表单状态管理模块（Pinia Store）v3
 *
 * 职责：管理表单填写流程的全局状态和所有表单数据。
 * v3 变更：所有表单数据集中存储在 store 中，不再分散在各组件。
 * 进一步变更：草稿支持分步保存与稳定续填，避免恢复失败时误建新 submission。
 */
import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  createSubmission, getStatus, completeSubmission,
  getStep1, saveStep1 as apiSaveStep1,
  getStep3Left, saveStep3Left as apiSaveStep3Left, getStep3Right, saveStep3Right as apiSaveStep3Right,
  getLeftTemplate, getRightTemplate
} from '../api/form'

const SESSION_TOKEN_KEY = 'sessionToken'

export const useFormStore = defineStore('form', () => {
  const currentStep = ref(1)
  const submissionId = ref(null)
  const sessionToken = ref('')
  const completed = ref(false)
  const loading = ref(false)
  const saving = ref(false)

  // ===== 第1步：基础信息表单数据 =====
  const basicInfo = reactive({
    name: '', height: '', weight: '', education: '', occupation: '',
    shoeSize: '', province: '', city: '', qq: '', wechat: '', weibo: '',
    phone: '', firstMasturbationAge: '', firstSexAge: '', isSingle: '',
    cheatedOnPartner: '', beenCheated: '', longestLockTime: '',
    sexFrequency: '', masturbationFrequency: '', masturbationTool: '',
    analInsertableSize: '', urethraInsertableSize: '', dogAge: '',
    meetingCount: '', masterCount: '', semenVolume: '',
    dailyMaxEjaculation: '', preferredName: '', selfDescription: '', remark: ''
  })

  // ===== 第3步：左侧自评数据 =====
  const leftRows = ref([])

  // ===== 第3步：右侧自评数据 =====
  const rightRows = ref([])

  // ===== 第2步：照片统计（照片即时上传，这里只记录数量） =====
  const photoCounts = reactive({
    selfie: 0, nude: 0, dick: 0, other: 0
  })

  /**
   * 判断当前是否已有有效 submissionId
   *
   * @returns {boolean} 是否有效
   */
  function hasSubmission() {
    return submissionId.value !== null && submissionId.value !== undefined && submissionId.value !== '' && submissionId.value !== 'null'
  }

  /**
   * 从浏览器存储读取会话令牌
   *
   * 优先使用 localStorage，兼容旧版 sessionStorage。
   *
   * @returns {string} 会话令牌
   */
  function getStoredSessionToken() {
    return localStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY) || ''
  }

  /**
   * 持久化保存会话令牌
   *
   * 同时写入 localStorage 和 sessionStorage，兼容旧逻辑并支持关闭页面后恢复。
   *
   * @param {string} token 会话令牌
   */
  function persistSessionToken(token) {
    sessionToken.value = token || ''
    if (!token) return
    localStorage.setItem(SESSION_TOKEN_KEY, token)
    sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  }

  /**
   * 清理本地会话令牌
   */
  function clearSessionToken() {
    sessionToken.value = ''
    localStorage.removeItem(SESSION_TOKEN_KEY)
    sessionStorage.removeItem(SESSION_TOKEN_KEY)
  }

  /**
   * 创建新的提交记录
   */
  async function createNewSubmission() {
    const res = await createSubmission()
    persistSessionToken(res.data.sessionToken)
    submissionId.value = res.data.submissionId
    currentStep.value = 1
    completed.value = false
  }

  /**
   * 更新照片统计
   *
   * @param {string} category 照片类别
   * @param {number} count 数量
   */
  function updatePhotoCount(category, count) {
    photoCounts[category] = count
  }

  /**
   * 初始化表单
   *
   * 优先恢复已有草稿；只有在明确没有有效会话时才创建新的 submission。
   */
  async function initForm() {
    loading.value = true
    try {
      let shouldCreateSubmission = true
      const savedToken = getStoredSessionToken()

      if (savedToken) {
        persistSessionToken(savedToken)
        try {
          const res = await getStatus()
          if (res.data && res.data.submissionId && !res.data.completed) {
            currentStep.value = res.data.currentStep || 1
            submissionId.value = res.data.submissionId
            completed.value = false
            shouldCreateSubmission = false
          } else {
            submissionId.value = null
            clearSessionToken()
          }
        } catch (error) {
          console.error('恢复会话失败：', error)
          const shouldResetToken = error.message?.includes('会话') || error.message?.includes('提交记录不存在')
          if (shouldResetToken) {
            submissionId.value = null
            clearSessionToken()
          } else {
            return
          }
        }
      }

      if (shouldCreateSubmission) {
        await createNewSubmission()
      }

      await loadAllData()
    } catch (error) {
      console.error('初始化表单失败：', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载所有已有数据或模板
   *
   * 如果用户之前填写过则加载已有数据，否则加载预设模板。
   * 所有数据存储在 store 中，组件通过 store 读取和修改。
   */
  async function loadAllData() {
    if (!hasSubmission()) return

    try {
      const [step1Res, leftRes, rightRes] = await Promise.all([
        getStep1(submissionId.value),
        getStep3Left(submissionId.value),
        getStep3Right(submissionId.value)
      ])

      if (step1Res.data) {
        Object.assign(basicInfo, step1Res.data)
      }

      if (leftRes.data && leftRes.data.length > 0) {
        leftRows.value = leftRes.data
      } else {
        const templateRes = await getLeftTemplate()
        leftRows.value = (templateRes.data || []).map(t => ({
          typeName: t.typeName,
          itemName: t.itemName,
          level: '',
          remark: '',
          rowOrder: t.rowOrder
        }))
      }

      if (rightRes.data && rightRes.data.length > 0) {
        rightRows.value = rightRes.data
      } else {
        const templateRes = await getRightTemplate()
        rightRows.value = (templateRes.data || []).map(t => ({
          typeName: t.typeName,
          itemName: t.itemName,
          level: '',
          remark: '',
          rowOrder: t.rowOrder
        }))
      }
    } catch (error) {
      console.error('加载数据失败：', error)
    }
  }

  /**
   * 持久化保存第1步数据
   */
  async function persistStep1() {
    await apiSaveStep1(submissionId.value, { ...basicInfo })
  }

  /**
   * 持久化保存第3步数据
   */
  async function persistStep3() {
    await Promise.all([
      apiSaveStep3Left(submissionId.value, leftRows.value),
      apiSaveStep3Right(submissionId.value, rightRows.value)
    ])
  }

  /**
   * 保存第1步草稿
   *
   * @returns {Promise<boolean>} 是否保存成功
   */
  async function saveStep1Draft() {
    if (!hasSubmission()) return false

    saving.value = true
    try {
      await persistStep1()
      return true
    } catch (error) {
      console.error('保存第1步失败：', error)
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * 保存第3步草稿
   *
   * @returns {Promise<boolean>} 是否保存成功
   */
  async function saveStep3Draft() {
    if (!hasSubmission()) return false

    saving.value = true
    try {
      await persistStep3()
      return true
    } catch (error) {
      console.error('保存第3步失败：', error)
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * 按当前步骤保存草稿
   *
   * @returns {Promise<boolean>} 是否保存成功
   */
  async function saveCurrentStep() {
    if (currentStep.value === 1) {
      return saveStep1Draft()
    }
    if (currentStep.value === 3) {
      return saveStep3Draft()
    }
    return true
  }

  /**
   * 一键保存所有数据
   *
   * 三步全填完后调用，一次性保存基础信息、左侧自评、右侧自评。
   * 照片已在上传时即时保存，这里不需要重复处理。
   *
   * @returns {Promise<boolean>} 是否保存成功
   */
  async function saveAll() {
    if (!hasSubmission()) return false

    saving.value = true
    try {
      await Promise.all([
        persistStep1(),
        persistStep3()
      ])
      return true
    } catch (error) {
      console.error('保存失败：', error)
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * 提交前准备预览
   *
   * @returns {Promise<boolean>} 是否准备成功
   */
  async function preparePreview() {
    return saveCurrentStep()
  }

  /**
   * 提交完成
   *
   * 保存所有数据后，标记提交为已完成。
   */
  async function submitAll() {
    const saveSuccess = await saveAll()
    if (!saveSuccess) return false

    try {
      await completeSubmission()
      completed.value = true
      clearSessionToken()
      return true
    } catch (error) {
      console.error('完成提交失败：', error)
      return false
    }
  }

  /**
   * 前进到下一步
   *
   * @returns {Promise<boolean>} 是否切换成功
   */
  async function nextStep() {
    if (currentStep.value >= 3 || saving.value) return true
    const saveSuccess = await saveCurrentStep()
    if (saveSuccess) {
      currentStep.value++
    }
    return saveSuccess
  }

  /**
   * 返回上一步
   *
   * @returns {Promise<boolean>} 是否切换成功
   */
  async function prevStep() {
    if (currentStep.value <= 1 || saving.value) return true
    const saveSuccess = await saveCurrentStep()
    if (saveSuccess) {
      currentStep.value--
    }
    return saveSuccess
  }

  /**
   * 跳转到指定步骤
   *
   * @param {number} step 目标步骤
   * @returns {Promise<boolean>} 是否切换成功
   */
  async function goToStep(step) {
    if (step < 1 || step > 3 || step === currentStep.value || saving.value) return true
    const saveSuccess = await saveCurrentStep()
    if (saveSuccess) {
      currentStep.value = step
    }
    return saveSuccess
  }

  return {
    currentStep, submissionId, sessionToken, completed, loading, saving,
    basicInfo, leftRows, rightRows, photoCounts,
    initForm, loadAllData, saveAll, saveCurrentStep,
    saveStep1Draft, saveStep3Draft, preparePreview, submitAll,
    nextStep, prevStep, goToStep, updatePhotoCount
  }
})
