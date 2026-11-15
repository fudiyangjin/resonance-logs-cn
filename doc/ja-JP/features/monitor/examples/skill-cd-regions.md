# クラススキルと幻想スキルを分けて配置する

関連ページ：[スキル CD](../skill-cd.md)

**シナリオ**：クラスのバーストスキルをキャラクターの右側に 1 列で並べ、幻想スキルとロールスキルを左側に置きたいとします。さらに、必殺技が使えるようになる 3 秒前に音声で知らせてほしいとします。

## ステップ 1：クラスとスキルを選ぶ

1. ページ上部の **{{ui:skillMonitor.profile.title}} → {{ui:skillMonitor.profile.classLabel}}** で自分のクラスを選びます。
2. **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.skillCd}}** を開き、**{{ui:skillMonitor.skillCd.skills.title}}** で見たいクラススキルをクリックします。全エリア合計で最大 10 個です。

## ステップ 2：2 つのエリアに分ける

1. **{{ui:skillMonitor.skillCd.preview.title}}** で **{{ui:skillMonitor.skillCd.region.add}}** をクリックし、新しいエリアに「幻想」と名前を付けます。
2. 「幻想」エリアに切り替え、**{{ui:skillMonitor.skillCd.resonance.title}}** で幻想スキルを検索し、**{{ui:skillMonitor.skillCd.duty.title}}** でロールスキルを選びます。選んだスキルは現在のエリアに入ります。
3. 「エリア 1」の **{{ui:skillMonitor.skillCd.layout.rows}}** を 1、**{{ui:skillMonitor.skillCd.layout.columns}}** を 5 に、「幻想」を 1 行 3 列にします。

## ステップ 3：スキル CD エリアをオンにして配置する

1. **{{ui:skillMonitor.tabs.overlay}}** で **スキル CD エリア** をオンにします。
2. ページ上部の **{{ui:skillMonitor.layout.editOverlayLayout}}** をクリックし、2 つのエリアをキャラクターの左右にドラッグして、それぞれ大きさを調整します。

## ステップ 4：必殺技の完了前に知らせる

1. **{{ui:skillMonitor.skillCd.voice.title}}** の **{{ui:skillMonitor.skillCd.voice.classSkills}}** タブで必殺技をクリックし、**完了 x 秒前** をオンにして 3 秒にします。
2. 最後の数秒を数字で聞きたい場合は、**{{ui:voice.binding.countdown}}** にもチェックを入れます。
3. **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** を開き、**{{ui:voice.bindings.generateMissing}}** をクリックします。

## 結果

戦闘中は左右にスキルアイコンが並び、クールダウン中は暗くなって残り秒数が表示されます。必殺技が使えるようになる 3 秒前に音声が流れます。

> [!TIP]
> ゲームのスキルバーで CD が見えるスキルで、音声だけ欲しい場合は、クールダウン監視に追加する必要はありません。音声読み上げセクションで直接設定できます。
