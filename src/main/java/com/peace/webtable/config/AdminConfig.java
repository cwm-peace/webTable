package com.peace.webtable.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import java.util.Set;

/**
 * 管理员配置类
 *
 * 职责：读取管理员相关配置项（密码等）。
 * 管理员密码配置在 application.yml 的 admin.password 字段中。
 */
@Configuration
public class AdminConfig {

    /** 禁止用于管理员登录的默认或弱密码。 */
    private static final Set<String> FORBIDDEN_PASSWORDS = Set.of(
            "admin",
            "admin123",
            "password",
            "123456",
            "12345678"
    );

    /** 管理员登录密码，从 application.yml 读取 */
    @Value("${admin.password}")
    private String password;

    /** 单个客户端在统计窗口内允许的最大失败次数。 */
    @Value("${admin.login.max-failures:5}")
    private int loginMaxFailures = 5;

    /** 登录失败次数统计窗口，单位分钟。 */
    @Value("${admin.login.failure-window-minutes:15}")
    private long loginFailureWindowMinutes = 15;

    /** 达到失败上限后的锁定时长，单位分钟。 */
    @Value("${admin.login.lock-minutes:15}")
    private long loginLockMinutes = 15;

    /**
     * 启动时校验管理员密码强度。
     *
     * 管理员入口能查看和导出所有敏感提交数据，不能允许空密码或默认弱密码进入运行态。
     */
    @PostConstruct
    public void validatePassword() {
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("管理员密码未配置，请设置 WEBTABLE_ADMIN_PASSWORD 或 admin.password");
        }
        if (password.length() < 12 || FORBIDDEN_PASSWORDS.contains(password.toLowerCase())) {
            throw new IllegalStateException("管理员密码过弱，请配置至少 12 位且非默认值的强密码");
        }
        if (loginMaxFailures < 1 || loginFailureWindowMinutes < 1 || loginLockMinutes < 1) {
            throw new IllegalStateException("管理员登录限流配置必须为正数");
        }
    }

    /**
     * 获取管理员密码
     *
     * @return 管理员密码
     */
    public String getPassword() {
        return password;
    }

    /**
     * 获取单客户端登录失败次数上限。
     *
     * @return 登录失败次数上限
     */
    public int getLoginMaxFailures() {
        return loginMaxFailures;
    }

    /**
     * 获取登录失败统计窗口。
     *
     * @return 统计窗口分钟数
     */
    public long getLoginFailureWindowMinutes() {
        return loginFailureWindowMinutes;
    }

    /**
     * 获取登录锁定时长。
     *
     * @return 锁定分钟数
     */
    public long getLoginLockMinutes() {
        return loginLockMinutes;
    }
}
