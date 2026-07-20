package com.peace.webtable.config;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 管理员安全配置测试。
 *
 * 防止系统带空密码或默认弱密码进入运行态。
 */
class AdminConfigTest {

    @Test
    void validatePasswordRejectsBlankPassword() {
        AdminConfig config = adminConfigWithPassword("");

        assertThatThrownBy(config::validatePassword)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("管理员密码未配置");
    }

    @Test
    void validatePasswordRejectsDefaultWeakPassword() {
        AdminConfig config = adminConfigWithPassword("admin123");

        assertThatThrownBy(config::validatePassword)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("管理员密码过弱");
    }

    @Test
    void validatePasswordAcceptsStrongPassword() {
        AdminConfig config = adminConfigWithPassword("Change-Me-2026-Strong");

        config.validatePassword();

        assertThat(config.getPassword()).isEqualTo("Change-Me-2026-Strong");
    }

    @Test
    void validatePasswordRejectsInvalidLoginLimitConfig() {
        AdminConfig config = adminConfigWithPassword("Change-Me-2026-Strong");
        ReflectionTestUtils.setField(config, "loginMaxFailures", 0);

        assertThatThrownBy(config::validatePassword)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("管理员登录限流配置必须为正数");
    }

    private AdminConfig adminConfigWithPassword(String password) {
        AdminConfig config = new AdminConfig();
        ReflectionTestUtils.setField(config, "password", password);
        return config;
    }
}
