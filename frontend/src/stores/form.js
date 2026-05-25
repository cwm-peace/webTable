/**
 * 表单状态管理模块（Pinia Store）v3
 *
 * 职责：管理表单填写流程的全局状态和所有表单数据。
 * v3 变更：所有表单数据集中存储在 store 中，不再分散在各组件。
 * 进一步变更：草稿支持分步保存与稳定续填，避免恢复失败时误建新 submission。
 * 兜底策略：表单数据自动缓存到 localStorage，刷新或网络异常时可恢复已填内容。
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
/** 本地表单草稿缓存 key */
const FORM_DRAFT_KEY = 'wt:formDraft'

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
    dailyMaxEjaculation: '', preferredName: '', selfDescription: '', trainingIntention: '', remark: ''
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
   * try-catch 兼容隐私模式下 Storage 被禁用的情况。
   *
   * @returns {string} 会话令牌
   */
  function getStoredSessionToken() {
    try {
      return localStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY) || ''
    } catch {
      return ''
    }
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
    try {
      localStorage.setItem(SESSION_TOKEN_KEY, token)
      sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    } catch {
      // 隐私模式下 Storage 被禁用，静默忽略
    }
  }

  /**
   * 清理本地会话令牌
   */
  function clearSessionToken() {
    sessionToken.value = ''
    try {
      localStorage.removeItem(SESSION_TOKEN_KEY)
      sessionStorage.removeItem(SESSION_TOKEN_KEY)
    } catch {
      // 忽略
    }
  }

  // ==================== 本地草稿缓存（兜底策略） ====================

  /** 自动保存定时器引用 */
  let autoSaveTimer = null
  /** 自动保存间隔（毫秒） */
  const AUTO_SAVE_INTERVAL = 15000

  /**
   * 将当前表单数据快照到 localStorage
   *
   * 作为刷新/崩溃/网络中断时的兜底恢复手段。
   * 仅在有有效 submissionId 时缓存，避免无效数据残留。
   */
  function saveDraftToLocal() {
    if (!hasSubmission()) return
    try {
      const snapshot = {
        submissionId: submissionId.value,
        sessionToken: sessionToken.value,
        currentStep: currentStep.value,
        basicInfo: { ...basicInfo },
        leftRows: JSON.parse(JSON.stringify(leftRows.value)),
        rightRows: JSON.parse(JSON.stringify(rightRows.value)),
        photoCounts: { ...photoCounts },
        savedAt: Date.now()
      }
      localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(snapshot))
    } catch {
      // 存储空间不足或隐私模式，静默忽略
    }
  }

  /**
   * 从 localStorage 恢复缓存的表单数据
   *
   * @param {string} [expectedSubmissionId] 期望的提交 ID，不匹配则跳过
   * @returns {boolean} 是否成功恢复
   */
  function restoreDraftFromLocal(expectedSubmissionId) {
    try {
      const raw = localStorage.getItem(FORM_DRAFT_KEY)
      if (!raw) return false

      const snapshot = JSON.parse(raw)
      // 缓存超过 24 小时视为过期
      if (!snapshot.savedAt || Date.now() - snapshot.savedAt > 24 * 60 * 60 * 1000) {
        clearLocalDraft()
        return false
      }
      // submissionId 不匹配时跳过（可能是旧草稿）
      if (expectedSubmissionId && snapshot.submissionId !== expectedSubmissionId) {
        return false
      }

      Object.assign(basicInfo, snapshot.basicInfo || {})
      if (snapshot.leftRows?.length) leftRows.value = snapshot.leftRows
      if (snapshot.rightRows?.length) rightRows.value = snapshot.rightRows
      if (snapshot.photoCounts) Object.assign(photoCounts, snapshot.photoCounts)
      if (snapshot.currentStep) currentStep.value = snapshot.currentStep
      return true
    } catch {
      return false
    }
  }

  /**
   * 清理本地草稿缓存（提交完成后调用）
   */
  function clearLocalDraft() {
    try {
      localStorage.removeItem(FORM_DRAFT_KEY)
    } catch {
      // 忽略
    }
  }

  /**
   * 启动自动缓存定时器
   *
   * 每 15 秒将表单数据快照到 localStorage，
   * 同时监听页面可见性变化和 beforeunload 事件，确保数据不丢失。
   */
  function startAutoSave() {
    stopAutoSave()
    autoSaveTimer = setInterval(saveDraftToLocal, AUTO_SAVE_INTERVAL)

    // 页面即将卸载时立即保存
    const handleBeforeUnload = () => saveDraftToLocal()
    // 页面从后台切回前台时保存（iOS Safari 后台回收的场景）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveDraftToLocal()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 将清理函数挂到 timer 上，方便 stopAutoSave 统一清理
    autoSaveTimer._cleanup = () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }

  /**
   * 停止自动缓存定时器
   */
  function stopAutoSave() {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
      autoSaveTimer._cleanup?.()
      autoSaveTimer = null
    }
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
   * 兜底策略：服务端数据恢复失败时，从 localStorage 缓存恢复已填内容。
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
            // 网络异常：尝试从本地缓存恢复，避免表单卡死
            const cached = restoreDraftFromLocal()
            if (cached) {
              console.info('网络异常，已从本地缓存恢复表单数据')
            }
            // 不再 return，让流程继续尝试创建新会话或加载数据
            shouldCreateSubmission = !hasSubmission()
          }
        }
      }

      if (shouldCreateSubmission) {
        try {
          await createNewSubmission()
        } catch (error) {
          // 创建新会话也失败（网络断开），尝试本地缓存兜底
          console.error('创建提交记录失败：', error)
          const cached = restoreDraftFromLocal()
          if (cached) {
            console.info('已从本地缓存恢复表单数据，请检查网络后重新提交')
          }
        }
      }

      await loadAllData()
    } catch (error) {
      console.error('初始化表单失败：', error)
      // 最终兜底：任何未预期的错误，尝试本地缓存
      restoreDraftFromLocal()
    } finally {
      loading.value = false
      // 初始化完成后启动自动缓存
      startAutoSave()
    }
  }

  /**
   * 加载所有已有数据或模板
   *
   * 使用 Promise.allSettled 确保各步骤数据独立加载，互不影响。
   * 任一步骤失败不会导致其他步骤数据丢失。
   * 加载成功后自动缓存到 localStorage，作为刷新后的兜底数据源。
   */
  async function loadAllData() {
    if (!hasSubmission()) return

    const [step1Result, leftResult, rightResult] = await Promise.allSettled([
      getStep1(submissionId.value),
      getStep3Left(submissionId.value),
      getStep3Right(submissionId.value)
    ])

    // 第1步：基础信息（独立容错）
    if (step1Result.status === 'fulfilled' && step1Result.value.data) {
      Object.assign(basicInfo, step1Result.value.data)
    } else if (step1Result.status === 'rejected') {
      console.error('加载第1步数据失败：', step1Result.reason)
    }

    // 第3步左侧：优先加载已有数据，无数据时加载模板
    if (leftResult.status === 'fulfilled' && leftResult.value.data && leftResult.value.data.length > 0) {
      leftRows.value = leftResult.value.data
    } else {
      if (leftResult.status === 'rejected') {
        console.error('加载第3步左侧数据失败：', leftResult.reason)
      }
      try {
        const templateRes = await getLeftTemplate()
        leftRows.value = (templateRes.data || []).map(t => ({
          typeName: t.typeName,
          itemName: t.itemName,
          level: '',
          remark: '',
          rowOrder: t.rowOrder
        }))
      } catch (error) {
        console.error('加载左侧模板失败：', error)
      }
    }

    // 第3步右侧：同上逻辑
    if (rightResult.status === 'fulfilled' && rightResult.value.data && rightResult.value.data.length > 0) {
      rightRows.value = rightResult.value.data
    } else {
      if (rightResult.status === 'rejected') {
        console.error('加载第3步右侧数据失败：', rightResult.reason)
      }
      try {
        const templateRes = await getRightTemplate()
        rightRows.value = (templateRes.data || []).map(t => ({
          typeName: t.typeName,
          itemName: t.itemName,
          level: '',
          remark: '',
          rowOrder: t.rowOrder
        }))
      } catch (error) {
        console.error('加载右侧模板失败：', error)
      }
    }

    // 服务端数据加载完毕，同步缓存到 localStorage
    saveDraftToLocal()
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
   * 清理本地草稿缓存和自动保存定时器。
   */
  async function submitAll() {
    const saveSuccess = await saveAll()
    if (!saveSuccess) return false

    try {
      await completeSubmission()
      completed.value = true
      clearSessionToken()
      stopAutoSave()
      clearLocalDraft()
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
    nextStep, prevStep, goToStep, updatePhotoCount,
    saveDraftToLocal, restoreDraftFromLocal, clearLocalDraft
  }
})
