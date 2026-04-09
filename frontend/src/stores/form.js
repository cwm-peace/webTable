/**
 * 表单状态管理模块（Pinia Store）v3
 *
 * 职责：管理表单填写流程的全局状态和所有表单数据。
 * v3 变更：所有表单数据集中存储在 store 中，不再分散在各组件。
 * 去掉了步骤内的独立保存，改为三步全填完后统一调用 saveAll() 保存。
 */
import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  createSubmission, getStatus, completeSubmission,
  getStep1, saveStep1,
  getStep3Left, saveStep3Left, getStep3Right, saveStep3Right,
  getLeftTemplate, getRightTemplate
} from '../api/form'

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
   * 首次访问时创建新的提交记录，已有会话时恢复状态。
   * 同时加载所有已有数据或模板数据到 store 中。
   */
  async function initForm() {
    loading.value = true
    try {
      const savedToken = sessionStorage.getItem('sessionToken')

      if (savedToken) {
        sessionToken.value = savedToken
        const res = await getStatus()
        if (res.data) {
          currentStep.value = res.data.currentStep || 1
          submissionId.value = res.data.submissionId
          completed.value = res.data.completed
        }
      }

      if (!submissionId.value || submissionId.value === 'null') {
        const res = await createSubmission()
        sessionToken.value = res.data.sessionToken
        submissionId.value = res.data.submissionId
        currentStep.value = 1
        sessionStorage.setItem('sessionToken', sessionToken.value)
      }

      // 加载所有已有数据或模板
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
    if (!submissionId.value || submissionId.value === 'null') return

    try {
      // 加载基础信息
      const step1Res = await getStep1(submissionId.value)
      if (step1Res.data) {
        Object.assign(basicInfo, step1Res.data)
      }

      // 加载左侧自评
      const leftRes = await getStep3Left(submissionId.value)
      if (leftRes.data && leftRes.data.length > 0) {
        leftRows.value = leftRes.data
      } else {
        // 从模板初始化
        const templateRes = await getLeftTemplate()
        leftRows.value = (templateRes.data || []).map(t => ({
          typeName: t.typeName,
          itemName: t.itemName,
          level: '',
          remark: '',
          rowOrder: t.rowOrder
        }))
      }

      // 加载右侧自评
      const rightRes = await getStep3Right(submissionId.value)
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
   * 一键保存所有数据
   *
   * 三步全填完后调用，一次性保存基础信息、左侧自评、右侧自评。
   * 照片已在上传时即时保存，这里不需要重复处理。
   *
   * @returns {Promise<boolean>} 是否保存成功
   */
  async function saveAll() {
    saving.value = true
    try {
      // 并行调用三个保存接口
      await Promise.all([
        saveStep1(submissionId.value, { ...basicInfo }),
        saveStep3Left(submissionId.value, leftRows.value),
        saveStep3Right(submissionId.value, rightRows.value)
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
      sessionStorage.removeItem('sessionToken')
      return true
    } catch (error) {
      console.error('完成提交失败：', error)
      return false
    }
  }

  function nextStep() {
    if (currentStep.value < 3) currentStep.value++
  }

  function prevStep() {
    if (currentStep.value > 1) currentStep.value--
  }

  function goToStep(step) {
    if (step >= 1 && step <= 3) currentStep.value = step
  }

  return {
    currentStep, submissionId, sessionToken, completed, loading, saving,
    basicInfo, leftRows, rightRows, photoCounts,
    initForm, loadAllData, saveAll, submitAll,
    nextStep, prevStep, goToStep, updatePhotoCount
  }
})
