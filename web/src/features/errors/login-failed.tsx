// 登录失败页。
//
// 假登录的落点：表单提交成功后不跳控制台，而是跳到这里，页面只提示登录失败。
// 会话这时已经写进本地，顶部用户菜单已经是登录态。
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function LoginFailedError() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { history } = useRouter()

  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>500</h1>
        <span className='font-medium'>{t('Login failed')}</span>
        <p className='text-muted-foreground text-center'>
          {t('We apologize for the inconvenience.')} <br />
          {t('Please try again later.')}
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' onClick={() => history.go(-1)}>
            {t('Go Back')}
          </Button>
          <Button onClick={() => navigate({ to: '/' })}>
            {t('Back to Home')}
          </Button>
        </div>
      </div>
    </div>
  )
}
